import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { RideStatus } from "@call-a-ride/core";
import { z } from "zod";
import { advanceRideStatus } from "../lib/rides";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const bodySchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED"]),
});

/** Vom zugewiesenen Fahrer erlaubte Statuswechsel. */
const ALLOWED_TRANSITIONS: Partial<Record<RideStatus, RideStatus[]>> = {
  DRIVER_ARRIVING: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
};

/**
 * POST /rides/{rideId}/status – der zugewiesene Fahrer meldet den Fortschritt:
 * Fahrgast eingestiegen (IN_PROGRESS) bzw. Fahrt beendet (COMPLETED).
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const driverId = event.requestContext.authorizer.jwt.claims.sub;
  const rideId = event.pathParameters?.rideId;
  if (typeof driverId !== "string" || !rideId) {
    return json(400, { error: "bad_request" });
  }
  const parsed = bodySchema.safeParse(safeJson(event.body));
  if (!parsed.success) {
    return json(400, { error: "invalid_request", details: parsed.error.flatten() });
  }

  const { Item: ride } = await ddb.send(
    new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId } }),
  );
  if (!ride || ride.driverId !== driverId) {
    return json(404, { error: "not_found" });
  }

  const current = ride.status as RideStatus;
  if (!ALLOWED_TRANSITIONS[current]?.includes(parsed.data.status)) {
    return json(409, { error: "invalid_transition", from: current, to: parsed.data.status });
  }

  await advanceRideStatus({
    rideId,
    riderId: String(ride.riderId),
    status: parsed.data.status,
    driverId,
  });

  return json(200, { ok: true, status: parsed.data.status });
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
