import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as cognito from "aws-cdk-lib/aws-cognito";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
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
  rideStateMachine: sfn.IStateMachine;
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
      fn: NodejsFunction;
      name: string;
    }> = [
      { path: "/rides", method: apigwv2.HttpMethod.POST, fn: createRideFn, name: "CreateRide" },
      { path: "/rides/{rideId}", method: apigwv2.HttpMethod.GET, fn: getRideFn, name: "GetRide" },
      { path: "/route", method: apigwv2.HttpMethod.GET, fn: routeQuoteFn, name: "RouteQuote" },
      { path: "/places/search", method: apigwv2.HttpMethod.GET, fn: placesSearchFn, name: "PlacesSearch" },
    ];
    for (const route of authedRoutes) {
      httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: new HttpLambdaIntegration(`${route.name}Integration`, route.fn),
        authorizer,
      });
    }

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
