import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import type * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const functionsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../functions",
);

export interface RideFlowStackProps extends StackProps {
  stage: "dev" | "prod";
  ridesTable: dynamodb.ITable;
  connectionsTable: dynamodb.ITable;
  webSocketApi: apigwv2.WebSocketApi;
  wsManagementEndpoint: string;
}

/**
 * Ride-Lifecycle als Step-Functions-Statemachine.
 *
 * Phase 1: ein simulierter Fahrer nimmt nach kurzer Wartezeit an und die Fahrt
 * durchläuft alle Status bis COMPLETED — beweist DB-Updates + Live-Push in die
 * App. Phase 2 ersetzt den Simulations-Block durch echtes Matching
 * (Geohash-Umkreissuche, Fahrer-Anfrage mit Timeout, Weiterreichung).
 */
export class RideFlowStack extends Stack {
  readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: RideFlowStackProps) {
    super(scope, id, props);

    const advanceFn = new NodejsFunction(this, "AdvanceStatusFn", {
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logRetention: RetentionDays.TWO_WEEKS,
      bundling: { minify: true, sourceMap: true },
      entry: path.join(functionsDir, "rides/advance-status.ts"),
      environment: {
        STAGE: props.stage,
        RIDES_TABLE: props.ridesTable.tableName,
        CONNECTIONS_TABLE: props.connectionsTable.tableName,
        WS_ENDPOINT: props.wsManagementEndpoint,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    props.ridesTable.grantWriteData(advanceFn);
    props.connectionsTable.grantReadWriteData(advanceFn);
    props.webSocketApi.grantManageConnections(advanceFn);

    const advance = (id: string, status: string, driverId?: string) =>
      new tasks.LambdaInvoke(this, id, {
        lambdaFunction: advanceFn,
        payload: sfn.TaskInput.fromObject({
          rideId: sfn.JsonPath.stringAt("$.rideId"),
          riderId: sfn.JsonPath.stringAt("$.riderId"),
          status,
          ...(driverId ? { driverId } : {}),
        }),
        resultPath: sfn.JsonPath.DISCARD,
      });

    const wait = (id: string, seconds: number) =>
      new sfn.Wait(this, id, { time: sfn.WaitTime.duration(Duration.seconds(seconds)) });

    const definition = advance("SetMatching", "MATCHING")
      .next(wait("SimulateSearch", 4))
      .next(advance("AssignDemoDriver", "ASSIGNED", "demo-driver"))
      .next(wait("SimulateApproach", 6))
      .next(advance("SetDriverArriving", "DRIVER_ARRIVING"))
      .next(wait("SimulatePickup", 8))
      .next(advance("SetInProgress", "IN_PROGRESS"))
      .next(wait("SimulateTrip", 15))
      .next(advance("SetCompleted", "COMPLETED"));

    this.stateMachine = new sfn.StateMachine(this, "RideStateMachine", {
      stateMachineName: `car-${props.stage}-ride-lifecycle`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: Duration.minutes(10),
    });

    new CfnOutput(this, "RideStateMachineArn", { value: this.stateMachine.stateMachineArn });
  }
}
