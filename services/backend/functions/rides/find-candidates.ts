import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  coordinateSchema,
  geohashNeighborhood,
  haversineDistanceMeters,
} from "@call-a-ride/core";
import { z } from "zod";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const inputSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
});

const MAX_ATTEMPTS = 5;

/**
 * Sucht den nächstgelegenen verfügbaren Fahrer im Geohash-Umkreis des
 * Abholorts. Bereits angefragte Fahrer (ride.attemptedDrivers) werden
 * übersprungen; nach MAX_ATTEMPTS gibt die Statemachine auf.
 */
export const handler = async (rawInput: unknown) => {
  const { rideId } = inputSchema.parse(rawInput);

  const { Item: ride } = await ddb.send(
    new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId } }),
  );
  if (!ride) throw new Error(`ride ${rideId} not found`);

  const pickup = coordinateSchema.parse(ride.pickup);
  const attempted = new Set<string>((ride.attemptedDrivers as string[] | undefined) ?? []);

  if (attempted.size >= MAX_ATTEMPTS) {
    return { found: false, exhausted: true };
  }

  const cells = geohashNeighborhood(pickup);
  const nowEpoch = Math.floor(Date.now() / 1000);

  const queries = await Promise.all(
    cells.map((cell) =>
      ddb.send(
        new QueryCommand({
          TableName: process.env.DRIVER_LOCATIONS_TABLE,
          KeyConditionExpression: "geohash = :g",
          ExpressionAttributeValues: { ":g": cell },
        }),
      ),
    ),
  );

  // Pro Fahrer nur den neuesten Eintrag behalten (Zellwechsel kann kurzzeitig
  // zwei Einträge erzeugen), abgelaufene TTL-Einträge ignorieren.
  const byDriver = new Map<string, { driverId: string; lat: number; lon: number; updatedAt: string }>();
  for (const q of queries) {
    for (const item of q.Items ?? []) {
      const driverId = item.driverId as string;
      if (attempted.has(driverId)) continue;
      if (item.available !== true) continue;
      if (typeof item.expiresAt === "number" && item.expiresAt < nowEpoch) continue;
      const existing = byDriver.get(driverId);
      if (!existing || String(item.updatedAt) > existing.updatedAt) {
        byDriver.set(driverId, {
          driverId,
          lat: item.lat as number,
          lon: item.lon as number,
          updatedAt: String(item.updatedAt),
        });
      }
    }
  }

  const candidates = [...byDriver.values()].sort(
    (a, b) =>
      haversineDistanceMeters({ lat: a.lat, lon: a.lon }, pickup) -
      haversineDistanceMeters({ lat: b.lat, lon: b.lon }, pickup),
  );

  const best = candidates[0];
  if (!best) {
    return { found: false, exhausted: false };
  }
  return { found: true, driverId: best.driverId };
};
