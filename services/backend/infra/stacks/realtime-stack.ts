import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as cognito from "aws-cdk-lib/aws-cognito";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
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
  driverLocationsTable: dynamodb.ITable;
  ridesTable: dynamodb.ITable;
  usersTable: dynamodb.ITable;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

export class RealtimeStack extends Stack {
  readonly webSocketApi: apigwv2.WebSocketApi;
  /** HTTPS-Endpoint der Management-API zum Senden an verbundene Clients. */
  readonly managementEndpoint: string;

  constructor(scope: Construct, id: string, props: RealtimeStackProps) {
    super(scope, id, props);

    const lambdaDefaults: NodejsFunctionProps = {
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
      environment: {
        ...lambdaDefaults.environment,
        USER_POOL_ID: props.userPool.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
      },
    });
    const disconnectFn = new NodejsFunction(this, "DisconnectFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "ws/disconnect.ts"),
    });
    const defaultFn = new NodejsFunction(this, "DefaultFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "ws/default.ts"),
    });
    const locationUpdateFn = new NodejsFunction(this, "LocationUpdateFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "ws/location-update.ts"),
      environment: {
        ...lambdaDefaults.environment,
        DRIVER_LOCATIONS_TABLE: props.driverLocationsTable.tableName,
        RIDES_TABLE: props.ridesTable.tableName,
        USERS_TABLE: props.usersTable.tableName,
      },
    });

    props.connectionsTable.grantWriteData(connectFn);
    props.connectionsTable.grantWriteData(disconnectFn);
    props.connectionsTable.grantReadData(defaultFn);
    props.connectionsTable.grantReadWriteData(locationUpdateFn);
    props.driverLocationsTable.grantReadWriteData(locationUpdateFn);
    props.ridesTable.grantReadData(locationUpdateFn);
    props.usersTable.grantReadData(locationUpdateFn);

    this.webSocketApi = new apigwv2.WebSocketApi(this, "WsApi", {
      apiName: `car-${props.stage}-ws`,
      routeSelectionExpression: "$request.body.action",
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
    this.webSocketApi.addRoute("locationUpdate", {
      integration: new WebSocketLambdaIntegration(
        "LocationUpdateIntegration",
        locationUpdateFn,
      ),
    });

    const wsStage = new apigwv2.WebSocketStage(this, "WsStage", {
      webSocketApi: this.webSocketApi,
      stageName: props.stage,
      autoDeploy: true,
    });

    this.webSocketApi.grantManageConnections(defaultFn);
    this.webSocketApi.grantManageConnections(locationUpdateFn);
    this.managementEndpoint = `https://${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${props.stage}`;
    locationUpdateFn.addEnvironment("WS_ENDPOINT", this.managementEndpoint);

    new CfnOutput(this, "WebSocketUrl", { value: wsStage.url });
  }
}
