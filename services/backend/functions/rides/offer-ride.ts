import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { coordinateSchema } from "@call-a-ride/core";
import { z } from "zod";
import { sendPushToUser } from "../lib/push";
import { pushToUser } from "../lib/ws-push";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const inputSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
  driverId: z.string(),
  taskToken: z.string(),
});

export const OFFER_TIMEOUT_SECONDS = 25;

/**
 * Bietet die Fahrt einem Fahrer an (Step-Functions-Callback-Pattern):
 * Task-Token in der Fahrt speichern, Fahrer als „angefragt" vormerken und
 * das Angebot über WebSocket zustellen. Die Statemachine wartet auf
 * SendTaskSuccess aus POST /rides/{rideId}/respond — oder läuft in den Timeout.
 */
export const handler = async (rawInput: unknown) => {
  const { rideId, riderId, driverId, taskToken } = inputSchema.parse(rawInput);

  const { Item: ride } = await ddb.send(
    new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId } }),
  );
  if (!ride) throw new Error(`ride ${rideId} not found`);

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.RIDES_TABLE,
      Key: { rideId },
      UpdateExpression:
        "SET offeredDriverId = :driverId, offerTaskToken = :token, updatedAt = :now, " +
        "attemptedDrivers = list_append(if_not_exists(attemptedDrivers, :empty), :attempt)",
      ExpressionAttributeValues: {
        ":driverId": driverId,
        ":token": taskToken,
        ":now": new Date().toISOString(),
        ":empty": [],
        ":attempt": [driverId],
      },
    }),
  );

  // Push weckt die App; das verbindliche Angebot kommt über WebSocket,
  // sobald die App die Verbindung (wieder) aufgebaut hat
  await sendPushToUser(
    driverId,
    "Neue Fahrtanfrage",
    `${(Number(ride.distanceMeters) / 1000).toFixed(1)} km · ${(
      Number(ride.estimatedFareCents) / 100
    ).toFixed(2)} € – jetzt annehmen!`,
    { rideId },
  );

  await pushToUser(driverId, {
    type: "rideOffer",
    rideId,
    pickup: coordinateSchema.parse(ride.pickup),
    dropoff: coordinateSchema.parse(ride.dropoff),
    pickupAddress: String(ride.pickupAddress),
    dropoffAddress: String(ride.dropoffAddress),
    estimatedFareCents: Number(ride.estimatedFareCents),
    distanceMeters: Number(ride.distanceMeters),
    expiresInSeconds: OFFER_TIMEOUT_SECONDS,
  });

  return { rideId, riderId, offeredDriverId: driverId };
};
