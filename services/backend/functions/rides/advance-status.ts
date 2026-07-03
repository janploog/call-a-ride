import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { rideStatusSchema } from "@call-a-ride/core";
import { z } from "zod";
import { pushToUser } from "../lib/ws-push";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const inputSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
  status: rideStatusSchema,
  driverId: z.string().optional(),
});

/**
 * Task der Ride-Statemachine: setzt den nächsten Fahrt-Status in DynamoDB
 * und benachrichtigt den Fahrgast über seine WebSocket-Verbindung(en).
 */
export const handler = async (rawInput: unknown) => {
  const { rideId, riderId, status, driverId } = inputSchema.parse(rawInput);

  const expressionNames: Record<string, string> = { "#status": "status" };
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
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ConditionExpression: "attribute_exists(rideId)",
    }),
  );

  await pushToUser(riderId, { type: "rideStatusChanged", rideId, status, driverId });

  return { rideId, riderId, status };
};
