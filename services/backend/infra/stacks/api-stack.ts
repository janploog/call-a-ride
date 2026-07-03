import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as cognito from "aws-cdk-lib/aws-cognito";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
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
}

export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const lambdaDefaults = {
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logRetention: RetentionDays.TWO_WEEKS,
      bundling: { minify: true, sourceMap: true },
      environment: {
        STAGE: props.stage,
        RIDES_TABLE: props.ridesTable.tableName,
        CONFIG_TABLE: props.configTable.tableName,
        NODE_OPTIONS: "--enable-source-maps",
      },
    };

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

    httpApi.addRoutes({
      path: "/rides",
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration("CreateRideIntegration", createRideFn),
      authorizer,
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
