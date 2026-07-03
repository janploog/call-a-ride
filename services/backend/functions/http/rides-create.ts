import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { randomUUID } from "node:crypto";
import { estimateFareCents, rideRequestSchema, type Ride } from "@call-a-ride/core";
import { calculateRoute } from "../lib/routing";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

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

  const route = await calculateRoute(request.pickup, request.dropoff);
  if (route.distanceMeters < 100) {
    return json(400, { error: "pickup_and_dropoff_too_close" });
  }

  const now = new Date().toISOString();
  const ride: Ride = {
    rideId: randomUUID(),
    riderId,
    status: "REQUESTED",
    pickup: request.pickup,
    dropoff: request.dropoff,
    pickupAddress: request.pickupAddress,
    dropoffAddress: request.dropoffAddress,
    estimatedFareCents: estimateFareCents(route.distanceMeters, route.durationSeconds),
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
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

  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: process.env.RIDE_STATE_MACHINE_ARN,
      name: ride.rideId,
      input: JSON.stringify({ rideId: ride.rideId, riderId: ride.riderId }),
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
