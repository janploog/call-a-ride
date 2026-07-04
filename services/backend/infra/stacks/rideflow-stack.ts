import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import type * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
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
  driverLocationsTable: dynamodb.ITable;
  usersTable: dynamodb.ITable;
  webSocketApi: apigwv2.WebSocketApi;
  wsManagementEndpoint: string;
}

/**
 * Ride-Lifecycle als Step-Functions-Statemachine mit echtem Matching:
 *
 *   MATCHING → Kandidat suchen (Geohash-Umkreis) → Angebot an Fahrer
 *   (Callback-Pattern mit Task-Token, 30-s-Timeout) → bei Ablehnung/Timeout
 *   nächster Kandidat → bei Annahme ASSIGNED + DRIVER_ARRIVING.
 *
 * Ab dann treibt der Fahrer den Status über POST /rides/{id}/status weiter
 * (IN_PROGRESS, COMPLETED). Ohne Kandidaten oder nach 5 Versuchen:
 * NO_DRIVER_FOUND.
 */
export class RideFlowStack extends Stack {
  readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: RideFlowStackProps) {
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
        CONNECTIONS_TABLE: props.connectionsTable.tableName,
        DRIVER_LOCATIONS_TABLE: props.driverLocationsTable.tableName,
        USERS_TABLE: props.usersTable.tableName,
        WS_ENDPOINT: props.wsManagementEndpoint,
        NODE_OPTIONS: "--enable-source-maps",
      },
    };

    const advanceFn = new NodejsFunction(this, "AdvanceStatusFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "rides/advance-status.ts"),
    });
    const findCandidatesFn = new NodejsFunction(this, "FindCandidatesFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "rides/find-candidates.ts"),
    });
    const offerRideFn = new NodejsFunction(this, "OfferRideFn", {
      ...lambdaDefaults,
      entry: path.join(functionsDir, "rides/offer-ride.ts"),
    });

    props.ridesTable.grantWriteData(advanceFn);
    props.connectionsTable.grantReadWriteData(advanceFn);
    props.webSocketApi.grantManageConnections(advanceFn);
    advanceFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["events:PutEvents"],
        resources: [`arn:aws:events:${this.region}:${this.account}:event-bus/default`],
      }),
    );
    props.ridesTable.grantReadData(findCandidatesFn);
    props.driverLocationsTable.grantReadData(findCandidatesFn);
    props.ridesTable.grantReadWriteData(offerRideFn);
    props.connectionsTable.grantReadWriteData(offerRideFn);
    props.webSocketApi.grantManageConnections(offerRideFn);
    // Push-Zustellung liest das Expo-Token des Empfängers
    props.usersTable.grantReadData(advanceFn);
    props.usersTable.grantReadData(offerRideFn);

    const advance = (
      id: string,
      status: string,
      driverId?: string | sfn.JsonPath | ReturnType<typeof sfn.JsonPath.stringAt>,
    ) =>
      new tasks.LambdaInvoke(this, id, {
        lambdaFunction: advanceFn,
        payload: sfn.TaskInput.fromObject({
          rideId: sfn.JsonPath.stringAt("$.rideId"),
          riderId: sfn.JsonPath.stringAt("$.riderId"),
          status,
          ...(driverId ? { driverId } : {}),
        }),
        payloadResponseOnly: true,
        resultPath: sfn.JsonPath.DISCARD,
      });

    const setMatching = advance("SetMatching", "MATCHING");

    const findCandidates = new tasks.LambdaInvoke(this, "FindCandidates", {
      lambdaFunction: findCandidatesFn,
      payload: sfn.TaskInput.fromObject({
        rideId: sfn.JsonPath.stringAt("$.rideId"),
        riderId: sfn.JsonPath.stringAt("$.riderId"),
      }),
      payloadResponseOnly: true,
      resultPath: "$.search",
    });

    const offerRide = new tasks.LambdaInvoke(this, "OfferRide", {
      lambdaFunction: offerRideFn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        rideId: sfn.JsonPath.stringAt("$.rideId"),
        riderId: sfn.JsonPath.stringAt("$.riderId"),
        driverId: sfn.JsonPath.stringAt("$.search.driverId"),
        taskToken: sfn.JsonPath.taskToken,
      }),
      taskTimeout: sfn.Timeout.duration(Duration.seconds(30)),
      resultPath: "$.offer",
    });
    // Timeout oder Fehler beim Angebot → nächsten Kandidaten suchen
    // (der Fahrer ist bereits als angefragt markiert)
    offerRide.addCatch(findCandidates, {
      errors: ["States.ALL"],
      resultPath: sfn.JsonPath.DISCARD,
    });

    const noDriverFound = advance("SetNoDriverFound", "NO_DRIVER_FOUND").next(
      new sfn.Fail(this, "MatchingFailed", {
        error: "NoDriverFound",
        cause: "Kein verfügbarer Fahrer hat die Fahrt angenommen",
      }),
    );

    const assignDriver = advance(
      "AssignDriver",
      "ASSIGNED",
      sfn.JsonPath.stringAt("$.offer.driverId"),
    )
      .next(
        advance(
          "SetDriverArriving",
          "DRIVER_ARRIVING",
          sfn.JsonPath.stringAt("$.offer.driverId"),
        ),
      )
      .next(new sfn.Succeed(this, "DriverAssigned"));

    const checkOffer = new sfn.Choice(this, "OfferAccepted?")
      .when(sfn.Condition.booleanEquals("$.offer.accepted", true), assignDriver)
      .otherwise(findCandidates);

    const hasCandidate = new sfn.Choice(this, "CandidateFound?")
      .when(sfn.Condition.booleanEquals("$.search.found", true), offerRide.next(checkOffer))
      .otherwise(noDriverFound);

    const definition = setMatching.next(findCandidates).next(hasCandidate);

    this.stateMachine = new sfn.StateMachine(this, "RideStateMachine", {
      stateMachineName: `car-${props.stage}-ride-lifecycle`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: Duration.minutes(15),
    });

    new CfnOutput(this, "RideStateMachineArn", { value: this.stateMachine.stateMachineArn });
  }
}
