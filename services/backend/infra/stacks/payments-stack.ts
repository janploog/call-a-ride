import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { RIDE_EVENT_SOURCE } from "../../functions/lib/events";

const functionsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../functions",
);

export interface PaymentsStackProps extends StackProps {
  stage: "dev" | "prod";
  usersTable: dynamodb.ITable;
  ridesTable: dynamodb.ITable;
}

/**
 * Stripe-Integration: Connect-Onboarding, SetupIntent für die PaymentSheet,
 * Off-Session-Charge bei Fahrtende (EventBridge-getriggert) und Webhook.
 *
 * Nach dem ersten Deploy einmalig die Test-Keys hinterlegen:
 *   aws secretsmanager put-secret-value --secret-id car-<stage>-stripe \
 *     --secret-string '{"secretKey":"sk_test_…","webhookSecret":"whsec_…"}'
 */
export class PaymentsStack extends Stack {
  readonly setupIntentFn: NodejsFunction;
  readonly onboardingFn: NodejsFunction;
  readonly webhookFn: NodejsFunction;

  constructor(scope: Construct, id: string, props: PaymentsStackProps) {
    super(scope, id, props);

    const stripeSecret = new secretsmanager.Secret(this, "StripeSecret", {
      secretName: `car-${props.stage}-stripe`,
      description: "Stripe API keys: {secretKey, webhookSecret}",
    });

    const lambdaDefaults: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(15),
      logRetention: RetentionDays.TWO_WEEKS,
      bundling: { minify: true, sourceMap: true },
      environment: {
        STAGE: props.stage,
        USERS_TABLE: props.usersTable.tableName,
        RIDES_TABLE: props.ridesTable.tableName,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
        NODE_OPTIONS: "--enable-source-maps",
      },
    };

    this.setupIntentFn = new NodejsFunction(this, "SetupIntentFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "payments/setup-intent.ts"),
    });
    this.onboardingFn = new NodejsFunction(this, "OnboardingFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "payments/connect-onboarding.ts"),
      environment: {
        ...lambdaDefaults.environment,
        // In Produktion: eigene Domain mit Erfolgs-/Retry-Seiten
        STRIPE_LINK_BASE_URL: "https://call-a-ride.example.com",
      },
    });
    this.webhookFn = new NodejsFunction(this, "StripeWebhookFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "payments/stripe-webhook.ts"),
    });
    const chargeFn = new NodejsFunction(this, "ChargeRideFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "payments/charge-ride.ts"),
      timeout: Duration.seconds(30),
    });

    for (const fn of [this.setupIntentFn, this.onboardingFn, this.webhookFn, chargeFn]) {
      stripeSecret.grantRead(fn);
    }
    props.usersTable.grantReadWriteData(this.setupIntentFn);
    props.usersTable.grantReadWriteData(this.onboardingFn);
    props.usersTable.grantReadWriteData(this.webhookFn);
    props.usersTable.grantReadData(chargeFn);
    props.ridesTable.grantReadWriteData(this.webhookFn);
    props.ridesTable.grantReadWriteData(chargeFn);

    new events.Rule(this, "RideCompletedRule", {
      description: "Fahrt abgeschlossen → Zahlung einziehen",
      eventPattern: {
        source: [RIDE_EVENT_SOURCE],
        detailType: ["ride.statusChanged"],
        detail: { status: ["COMPLETED"] },
      },
      targets: [new targets.LambdaFunction(chargeFn, { retryAttempts: 2 })],
    });

    new CfnOutput(this, "StripeSecretName", { value: stripeSecret.secretName });
  }
}
