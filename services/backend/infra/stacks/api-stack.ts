import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as cognito from "aws-cdk-lib/aws-cognito";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Runtime, type IFunction } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import type * as s3 from "aws-cdk-lib/aws-s3";
import type * as sfn from "aws-cdk-lib/aws-stepfunctions";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const functionsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../functions",
);

export interface ApiStackProps extends StackProps {
  stage: "dev" | "prod";
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  ridesTable: dynamodb.ITable;
  configTable: dynamodb.ITable;
  connectionsTable: dynamodb.ITable;
  usersTable: dynamodb.ITable;
  documentsBucket: s3.IBucket;
  rideStateMachine: sfn.IStateMachine;
  webSocketApi: apigwv2.WebSocketApi;
  wsManagementEndpoint: string;
  setupIntentFn: IFunction;
  stripeOnboardingFn: IFunction;
  stripeWebhookFn: IFunction;
}

export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const lambdaDefaults: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logRetention: RetentionDays.TWO_WEEKS,
      bundling: { minify: true, sourceMap: true },
      environment: {
        STAGE: props.stage,
        RIDES_TABLE: props.ridesTable.tableName,
        CONFIG_TABLE: props.configTable.tableName,
        USERS_TABLE: props.usersTable.tableName,
        DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        RIDE_STATE_MACHINE_ARN: props.rideStateMachine.stateMachineArn,
        NODE_OPTIONS: "--enable-source-maps",
      },
    };

    // Amazon Location v2 (Standalone-APIs): Routing & Places brauchen keine
    // CDK-Ressourcen, nur IAM-Rechte auf den Default-Provider.
    const geoRoutesPolicy = new iam.PolicyStatement({
      actions: ["geo-routes:CalculateRoutes"],
      resources: [`arn:aws:geo-routes:${this.region}::provider/default`],
    });
    const geoPlacesPolicy = new iam.PolicyStatement({
      actions: ["geo-places:SearchText"],
      resources: [`arn:aws:geo-places:${this.region}::provider/default`],
    });

    const healthFn = new NodejsFunction(this, "HealthFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/health.ts"),
    });

    const createRideFn = new NodejsFunction(this, "CreateRideFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/rides-create.ts"),
    });
    props.ridesTable.grantWriteData(createRideFn);
    props.configTable.grantReadData(createRideFn);
    props.rideStateMachine.grantStartExecution(createRideFn);
    createRideFn.addToRolePolicy(geoRoutesPolicy);

    const getRideFn = new NodejsFunction(this, "GetRideFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/rides-get.ts"),
    });
    props.ridesTable.grantReadData(getRideFn);

    const routeQuoteFn = new NodejsFunction(this, "RouteQuoteFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/route-quote.ts"),
    });
    routeQuoteFn.addToRolePolicy(geoRoutesPolicy);

    const placesSearchFn = new NodejsFunction(this, "PlacesSearchFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/places-search.ts"),
    });
    placesSearchFn.addToRolePolicy(geoPlacesPolicy);

    const respondRideFn = new NodejsFunction(this, "RespondRideFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/rides-respond.ts"),
    });
    props.ridesTable.grantReadWriteData(respondRideFn);
    props.rideStateMachine.grantTaskResponse(respondRideFn);

    const rideStatusFn = new NodejsFunction(this, "RideStatusFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/rides-status.ts"),
      environment: {
        ...lambdaDefaults.environment,
        CONNECTIONS_TABLE: props.connectionsTable.tableName,
        WS_ENDPOINT: props.wsManagementEndpoint,
      },
    });
    props.ridesTable.grantReadWriteData(rideStatusFn);
    props.connectionsTable.grantReadWriteData(rideStatusFn);
    props.webSocketApi.grantManageConnections(rideStatusFn);
    // Statuswechsel emittieren Domain-Events (z. B. Zahlung nach COMPLETED)
    rideStatusFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["events:PutEvents"],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/default`],
      }),
    );

    const earningsFn = new NodejsFunction(this, "DriverEarningsFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/driver-earnings.ts"),
    });
    props.ridesTable.grantReadData(earningsFn);

    const driversMeFn = new NodejsFunction(this, "DriversMeFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/drivers-me.ts"),
    });
    props.usersTable.grantReadData(driversMeFn);

    const driverDocumentsFn = new NodejsFunction(this, "DriverDocumentsFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/driver-documents.ts"),
    });
    props.usersTable.grantReadWriteData(driverDocumentsFn);
    props.documentsBucket.grantPut(driverDocumentsFn);

    const rideRatingFn = new NodejsFunction(this, "RideRatingFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "http/rides-rating.ts"),
    });
    props.ridesTable.grantReadWriteData(rideRatingFn);
    props.usersTable.grantReadWriteData(rideRatingFn);

    const adminDriversFn = new NodejsFunction(this, "AdminDriversFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "admin/drivers.ts"),
    });
    props.usersTable.grantReadWriteData(adminDriversFn);
    props.documentsBucket.grantRead(adminDriversFn);

    const adminRidesFn = new NodejsFunction(this, "AdminRidesFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "admin/rides.ts"),
    });
    props.ridesTable.grantReadData(adminRidesFn);

    const adminPricingFn = new NodejsFunction(this, "AdminPricingFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "admin/pricing.ts"),
    });
    props.configTable.grantReadWriteData(adminPricingFn);

    const authorizer = new HttpUserPoolAuthorizer("UserPoolAuthorizer", props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `car-${props.stage}-http`,
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    httpApi.addRoutes({
      path: "/health",
      methods: [apigwv2.HttpMethod.GET],
      integration: new HttpLambdaIntegration("HealthIntegration", healthFn),
    });

    const authedRoutes: Array<{
      path: string;
      method: apigwv2.HttpMethod;
      fn: IFunction;
      name: string;
    }> = [
      { path: "/rides", method: apigwv2.HttpMethod.POST, fn: createRideFn, name: "CreateRide" },
      { path: "/rides/{rideId}", method: apigwv2.HttpMethod.GET, fn: getRideFn, name: "GetRide" },
      { path: "/route", method: apigwv2.HttpMethod.GET, fn: routeQuoteFn, name: "RouteQuote" },
      { path: "/places/search", method: apigwv2.HttpMethod.GET, fn: placesSearchFn, name: "PlacesSearch" },
      { path: "/rides/{rideId}/respond", method: apigwv2.HttpMethod.POST, fn: respondRideFn, name: "RespondRide" },
      { path: "/rides/{rideId}/status", method: apigwv2.HttpMethod.POST, fn: rideStatusFn, name: "RideStatus" },
      { path: "/payments/setup-intent", method: apigwv2.HttpMethod.POST, fn: props.setupIntentFn, name: "SetupIntent" },
      { path: "/drivers/stripe-onboarding", method: apigwv2.HttpMethod.POST, fn: props.stripeOnboardingFn, name: "StripeOnboarding" },
      { path: "/drivers/me/earnings", method: apigwv2.HttpMethod.GET, fn: earningsFn, name: "DriverEarnings" },
      { path: "/drivers/me", method: apigwv2.HttpMethod.GET, fn: driversMeFn, name: "DriversMe" },
      { path: "/drivers/documents/upload-url", method: apigwv2.HttpMethod.POST, fn: driverDocumentsFn, name: "DriverDocuments" },
      { path: "/rides/{rideId}/rating", method: apigwv2.HttpMethod.POST, fn: rideRatingFn, name: "RideRating" },
      { path: "/admin/drivers", method: apigwv2.HttpMethod.GET, fn: adminDriversFn, name: "AdminDriversList" },
      { path: "/admin/drivers/{userId}/documents", method: apigwv2.HttpMethod.GET, fn: adminDriversFn, name: "AdminDriverDocs" },
      { path: "/admin/drivers/{userId}/verify", method: apigwv2.HttpMethod.POST, fn: adminDriversFn, name: "AdminDriverVerify" },
      { path: "/admin/rides", method: apigwv2.HttpMethod.GET, fn: adminRidesFn, name: "AdminRides" },
      { path: "/admin/config/pricing", method: apigwv2.HttpMethod.GET, fn: adminPricingFn, name: "AdminPricingGet" },
      { path: "/admin/config/pricing", method: apigwv2.HttpMethod.PUT, fn: adminPricingFn, name: "AdminPricingPut" },
    ];
    for (const route of authedRoutes) {
      httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: new HttpLambdaIntegration(`${route.name}Integration`, route.fn),
        authorizer,
      });
    }

    // Stripe ruft ohne JWT auf – Sicherheit über Signaturprüfung im Handler
    httpApi.addRoutes({
      path: "/webhooks/stripe",
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration("StripeWebhookIntegration", props.stripeWebhookFn),
    });

    // Drosselung als Kosten-Schutzschalter (Budget-Leitplanke)
    const defaultStage = httpApi.defaultStage?.node.defaultChild as
      | apigwv2.CfnStage
      | undefined;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: 20,
        throttlingRateLimit: 50,
      };
    }

    new CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
  }
}
