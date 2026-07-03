import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import {
  estimateFareCents,
  haversineDistanceMeters,
  rideRequestSchema,
  type Ride,
} from "@call-a-ride/core";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Bis zur Location-Service-Integration (Phase 1): Luftlinie × Umwegfaktor,
// Fahrzeit über eine mittlere Stadtgeschwindigkeit angenähert.
const ROUTE_DETOUR_FACTOR = 1.3;
const AVG_CITY_SPEED_KMH = 25;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const riderId = event.requestContext.authorizer.jwt.claims.sub;
  if (typeof riderId !== "string" || riderId.length === 0) {
    return json(401, { error: "unauthorized" });
  }

  const parsed = rideRequestSchema.safeParse(safeJson(event.body));
  if (!parsed.success) {
    return json(400, { error: "invalid_request", details: parsed.error.flatten() });
  }
  const request = parsed.data;

  const distanceMeters = Math.round(
    haversineDistanceMeters(request.pickup, request.dropoff) * ROUTE_DETOUR_FACTOR,
  );
  if (distanceMeters < 100) {
    return json(400, { error: "pickup_and_dropoff_too_close" });
  }
  const durationSeconds = Math.round((distanceMeters / 1000 / AVG_CITY_SPEED_KMH) * 3600);

  const now = new Date().toISOString();
  const ride: Ride = {
    rideId: randomUUID(),
    riderId,
    status: "REQUESTED",
    pickup: request.pickup,
    dropoff: request.dropoff,
    pickupAddress: request.pickupAddress,
    dropoffAddress: request.dropoffAddress,
    estimatedFareCents: estimateFareCents(distanceMeters, durationSeconds),
    distanceMeters,
    durationSeconds,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(
    new PutCommand({
      TableName: process.env.RIDES_TABLE,
      Item: ride,
      ConditionExpression: "attribute_not_exists(rideId)",
    }),
  );

  return json(201, ride);
};

function safeJson(body: string | undefined): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
