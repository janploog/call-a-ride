import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { RideStatus } from "@call-a-ride/core";
import { emitRideEvent } from "./events";
import { sendPushToUser } from "./push";
import { pushToUser } from "./ws-push";

/** Statuswechsel, die dem Fahrgast auch als Push zugestellt werden. */
const RIDER_PUSH_MESSAGES: Partial<Record<RideStatus, { title: string; body: string }>> = {
  ASSIGNED: {
    title: "Fahrer gefunden!",
    body: "Ein Fahrer hat deine Fahrt angenommen.",
  },
  DRIVER_ARRIVING: {
    title: "Dein Fahrer ist unterwegs",
    body: "Mach dich bereit – dein Fahrer kommt zum Abholort.",
  },
  COMPLETED: {
    title: "Fahrt abgeschlossen",
    body: "Danke fürs Mitfahren! Der Fahrpreis wird automatisch abgebucht.",
  },
  NO_DRIVER_FOUND: {
    title: "Kein Fahrer gefunden",
    body: "Leider hat aktuell kein Fahrer angenommen. Versuch es gleich noch einmal.",
  },
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Setzt den Fahrt-Status in DynamoDB und benachrichtigt den Fahrgast
 * über WebSocket. Gemeinsame Logik von Statemachine und Fahrer-Endpunkten.
 */
export async function advanceRideStatus(params: {
  rideId: string;
  riderId: string;
  status: RideStatus;
  driverId?: string;
}): Promise<void> {
  const { rideId, riderId, status, driverId } = params;

  let updateExpression = "SET #status = :status, updatedAt = :now";
  const expressionValues: Record<string, unknown> = {
    ":status": status,
    ":now": new Date().toISOString(),
  };
  if (driverId) {
    updateExpression += ", driverId = :driverId";
    expressionValues[":driverId"] = driverId;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.RIDES_TABLE,
      Key: { rideId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: expressionValues,
      ConditionExpression: "attribute_exists(rideId)",
    }),
  );

  await pushToUser(riderId, { type: "rideStatusChanged", rideId, status, driverId });
  const pushMessage = RIDER_PUSH_MESSAGES[status];
  if (pushMessage) {
    await sendPushToUser(riderId, pushMessage.title, pushMessage.body, { rideId, status });
  }
  await emitRideEvent("ride.statusChanged", { rideId, riderId, driverId, status });
}
