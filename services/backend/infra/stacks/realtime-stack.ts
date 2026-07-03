import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
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

export interface RealtimeStackProps extends StackProps {
  stage: "dev" | "prod";
  connectionsTable: dynamodb.ITable;
}

export class RealtimeStack extends Stack {
  readonly webSocketApi: apigwv2.WebSocketApi;
  /** HTTPS-Endpoint der Management-API zum Senden an verbundene Clients. */
  readonly managementEndpoint: string;

  constructor(scope: Construct, id: string, props: RealtimeStackProps) {
    super(scope, id, props);

    const lambdaDefaults = {
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logRetention: RetentionDays.TWO_WEEKS,
      bundling: { minify: true, sourceMap: true },
      environment: {
        STAGE: props.stage,
        CONNECTIONS_TABLE: props.connectionsTable.tableName,
        NODE_OPTIONS: "--enable-source-maps",
      },
    };

    const connectFn = new NodejsFunction(this, "ConnectFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "ws/connect.ts"),
    });
    const disconnectFn = new NodejsFunction(this, "DisconnectFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "ws/disconnect.ts"),
    });
    const defaultFn = new NodejsFunction(this, "DefaultFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "ws/default.ts"),
    });

    props.connectionsTable.grantWriteData(connectFn);
    props.connectionsTable.grantWriteData(disconnectFn);
    props.connectionsTable.grantReadData(defaultFn);

    this.webSocketApi = new apigwv2.WebSocketApi(this, "WsApi", {
      apiName: `car-${props.stage}-ws`,
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration("ConnectIntegration", connectFn),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "DisconnectIntegration",
          disconnectFn,
        ),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration("DefaultIntegration", defaultFn),
      },
    });

    const wsStage = new apigwv2.WebSocketStage(this, "WsStage", {
      webSocketApi: this.webSocketApi,
      stageName: props.stage,
      autoDeploy: true,
    });

    this.webSocketApi.grantManageConnections(defaultFn);
    this.managementEndpoint = `https://${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${props.stage}`;

    new CfnOutput(this, "WebSocketUrl", { value: wsStage.url });
  }
}
