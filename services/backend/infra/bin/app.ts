import { App } from "aws-cdk-lib";
import { AuthStack } from "../stacks/auth-stack";
import { DataStack } from "../stacks/data-stack";
import { ApiStack } from "../stacks/api-stack";
import { RealtimeStack } from "../stacks/realtime-stack";

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
new ApiStack(app, `${prefix}-api`, {
  env,
  stage,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
  ridesTable: data.ridesTable,
  configTable: data.configTable,
});
new RealtimeStack(app, `${prefix}-realtime`, {
  env,
  stage,
  connectionsTable: data.connectionsTable,
});
