import { App } from "aws-cdk-lib";
import { AuthStack } from "../stacks/auth-stack";
import { DataStack } from "../stacks/data-stack";
import { ApiStack } from "../stacks/api-stack";
import { LocationStack } from "../stacks/location-stack";
import { ObservabilityStack } from "../stacks/observability-stack";
import { PaymentsStack } from "../stacks/payments-stack";
import { RealtimeStack } from "../stacks/realtime-stack";
import { RideFlowStack } from "../stacks/rideflow-stack";

const app = new App();

const stage = app.node.tryGetContext("stage") ?? "dev";
if (stage !== "dev" && stage !== "prod") {
  throw new Error(`Unknown stage "${stage}" – expected dev or prod`);
}

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "eu-central-1",
};
const prefix = `car-${stage}`;

const auth = new AuthStack(app, `${prefix}-auth`, { env, stage });
const data = new DataStack(app, `${prefix}-data`, { env, stage });
const realtime = new RealtimeStack(app, `${prefix}-realtime`, {
  env,
  stage,
  connectionsTable: data.connectionsTable,
  driverLocationsTable: data.driverLocationsTable,
  ridesTable: data.ridesTable,
  usersTable: data.usersTable,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
});
const rideFlow = new RideFlowStack(app, `${prefix}-rideflow`, {
  env,
  stage,
  ridesTable: data.ridesTable,
  connectionsTable: data.connectionsTable,
  driverLocationsTable: data.driverLocationsTable,
  usersTable: data.usersTable,
  webSocketApi: realtime.webSocketApi,
  wsManagementEndpoint: realtime.managementEndpoint,
});
const payments = new PaymentsStack(app, `${prefix}-payments`, {
  env,
  stage,
  usersTable: data.usersTable,
  ridesTable: data.ridesTable,
});
new ApiStack(app, `${prefix}-api`, {
  env,
  stage,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  ridesTable: data.ridesTable,
  configTable: data.configTable,
  connectionsTable: data.connectionsTable,
  usersTable: data.usersTable,
  documentsBucket: data.documentsBucket,
  rideStateMachine: rideFlow.stateMachine,
  webSocketApi: realtime.webSocketApi,
  wsManagementEndpoint: realtime.managementEndpoint,
  setupIntentFn: payments.setupIntentFn,
  stripeOnboardingFn: payments.onboardingFn,
  stripeWebhookFn: payments.webhookFn,
  refundFn: payments.refundFn,
});
new LocationStack(app, `${prefix}-location`, { env, stage });
new ObservabilityStack(app, `${prefix}-observability`, {
  env,
  stage,
  rideStateMachine: rideFlow.stateMachine,
  ridesTable: data.ridesTable,
  alarmEmail: app.node.tryGetContext("alarmEmail"),
});
