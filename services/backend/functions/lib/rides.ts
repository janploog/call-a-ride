import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { RideStatus } from "@call-a-ride/core";
import { pushToUser } from "./ws-push";

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
}
