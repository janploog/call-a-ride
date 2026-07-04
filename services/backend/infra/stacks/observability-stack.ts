import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type * as sfn from "aws-cdk-lib/aws-stepfunctions";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const functionsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../functions",
);

export interface ObservabilityStackProps extends StackProps {
  stage: "dev" | "prod";
  rideStateMachine: sfn.IStateMachine;
  ridesTable: dynamodb.ITable;
  /** E-Mail für Alarme/Budget; per CDK-Kontext: -c alarmEmail=you@example.com */
  alarmEmail?: string;
}

/**
 * Betriebs-Leitplanken: SNS-Alarmkanal, CloudWatch-Alarme auf die kritischen
 * Pfade und ein Kosten-Budget mit Eskalationsstufen (Solo-Betrieb: lieber
 * eine Mail zu viel als eine ausgefallene Nacht unbemerkt).
 */
export class ObservabilityStack extends Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      topicName: `car-${props.stage}-alarms`,
    });
    if (props.alarmEmail) {
      alarmTopic.addSubscription(
        new subscriptions.EmailSubscription(props.alarmEmail),
      );
    }
    const alarmAction = new cwActions.SnsAction(alarmTopic);

    // Fehlgeschlagene Ride-Lifecycle-Executions (ohne NO_DRIVER_FOUND wäre
    // feiner — der bewusste Fail-State zählt hier mit; Feintuning nach Beta)
    const sfnFailedAlarm = new cloudwatch.Alarm(this, "RideFlowFailedAlarm", {
      alarmName: `car-${props.stage}-rideflow-failed`,
      metric: props.rideStateMachine.metricFailed({
        period: Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 3,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription:
        "Mehrere Fahrten scheitern in kurzer Zeit (Matching/Statemachine)",
    });
    sfnFailedAlarm.addAlarmAction(alarmAction);

    // Grobe Sammelmetrik über alle Lambdas des Accounts – Frühwarnsystem
    const lambdaErrorsAlarm = new cloudwatch.Alarm(this, "LambdaErrorsAlarm", {
      alarmName: `car-${props.stage}-lambda-errors`,
      metric: new cloudwatch.Metric({
        namespace: "AWS/Lambda",
        metricName: "Errors",
        period: Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 10,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Gehäufte Lambda-Fehler (accountweit)",
    });
    lambdaErrorsAlarm.addAlarmAction(alarmAction);

    // Wächter für hängende Fahrten: meldet aktive Fahrten ohne Fortschritt
    const staleMonitorFn = new NodejsFunction(this, "StaleRideMonitorFn", {
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(30),
      logRetention: RetentionDays.TWO_WEEKS,
      bundling: { minify: true, sourceMap: true },
      entry: path.join(functionsDir, "rides/stale-monitor.ts"),
      environment: {
        STAGE: props.stage,
        RIDES_TABLE: props.ridesTable.tableName,
        ALARM_TOPIC_ARN: alarmTopic.topicArn,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    props.ridesTable.grantReadData(staleMonitorFn);
    alarmTopic.grantPublish(staleMonitorFn);
    new events.Rule(this, "StaleRideSchedule", {
      description: "Alle 30 Minuten nach hängenden Fahrten suchen",
      schedule: events.Schedule.rate(Duration.minutes(30)),
      targets: [new targets.LambdaFunction(staleMonitorFn)],
    });

    if (props.alarmEmail) {
      // AWS Budgets rechnet in USD; ~100 € Zielbudget
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetName: `car-${props.stage}-monthly`,
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: { amount: 110, unit: "USD" },
        },
        notificationsWithSubscribers: [50, 80, 100].map((threshold) => ({
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: props.alarmEmail! }],
        })),
      });
    }

    new CfnOutput(this, "AlarmTopicArn", { value: alarmTopic.topicArn });
  }
}
