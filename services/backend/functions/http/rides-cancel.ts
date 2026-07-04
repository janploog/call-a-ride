import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, StopExecutionCommand } from "@aws-sdk/client-sfn";
import type { RideStatus } from "@call-a-ride/core";
import { getUserId } from "../lib/auth";
import { sendPushToUser } from "../lib/push";
import { advanceRideStatus } from "../lib/rides";
import { pushToUser } from "../lib/ws-push";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

const CANCELLABLE: RideStatus[] = [
  "REQUESTED",
  "MATCHING",
  "ASSIGNED",
  "DRIVER_ARRIVING",
];

/**
 * POST /rides/{rideId}/cancel – Stornierung durch den Fahrgast, solange die
 * Fahrt noch nicht läuft. Stoppt die Matching-Statemachine und informiert
 * den (ggf. bereits zugewiesenen) Fahrer über WebSocket.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const rideId = event.pathParameters?.rideId;
  if (!userId || !rideId) return json(400, { error: "bad_request" });

  const { Item: ride } = await ddb.send(
    new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId } }),
  );
  if (!ride || ride.riderId !== userId) return json(404, { error: "not_found" });

  const status = ride.status as RideStatus;
  if (!CANCELLABLE.includes(status)) {
    return json(409, { error: "not_cancellable", status });
  }

  // Statemachine-Execution heißt wie die Fahrt (name = rideId)
  const executionArn = `${String(process.env.RIDE_STATE_MACHINE_ARN).replace(
    ":stateMachine:",
    ":execution:",
  )}:${rideId}`;
  try {
    await sfn.send(
      new StopExecutionCommand({ executionArn, cause: "cancelled by rider" }),
    );
  } catch {
    // Execution bereits beendet – Stornierung trotzdem fortsetzen
  }

  await advanceRideStatus({ rideId, riderId: userId, status: "CANCELLED" });

  const driverToNotify = (ride.driverId ?? ride.offeredDriverId) as string | undefined;
  if (driverToNotify) {
    await pushToUser(driverToNotify, { type: "rideCancelled", rideId });
    await sendPushToUser(
      driverToNotify,
      "Fahrt storniert",
      "Der Fahrgast hat die Fahrt storniert. Du kannst wieder online gehen.",
      { rideId },
    );
  }

  return json(200, { ok: true, status: "CANCELLED" });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
