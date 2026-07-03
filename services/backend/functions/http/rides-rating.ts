import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { getUserId } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const bodySchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

/**
 * POST /rides/{rideId}/rating – beidseitige Bewertung nach Fahrtende.
 * Fahrgast bewertet Fahrer und umgekehrt; genau einmal pro Seite.
 * Aggregat (ratingSum/ratingCount) liegt am bewerteten Nutzer.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  const rideId = event.pathParameters?.rideId;
  if (!userId || !rideId) return json(400, { error: "bad_request" });

  const parsed = bodySchema.safeParse(safeJson(event.body));
  if (!parsed.success) {
    return json(400, { error: "invalid_request", details: parsed.error.flatten() });
  }

  const { Item: ride } = await ddb.send(
    new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId } }),
  );
  if (!ride) return json(404, { error: "not_found" });
  if (ride.status !== "COMPLETED") return json(409, { error: "ride_not_completed" });

  let ratingField: "ratingByRider" | "ratingByDriver";
  let ratedUserId: string;
  if (ride.riderId === userId && typeof ride.driverId === "string") {
    ratingField = "ratingByRider";
    ratedUserId = ride.driverId;
  } else if (ride.driverId === userId) {
    ratingField = "ratingByDriver";
    ratedUserId = String(ride.riderId);
  } else {
    return json(404, { error: "not_found" });
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.RIDES_TABLE,
        Key: { rideId },
        UpdateExpression: "SET #field = :rating, updatedAt = :now",
        ExpressionAttributeNames: { "#field": ratingField },
        ExpressionAttributeValues: {
          ":rating": { stars: parsed.data.stars, comment: parsed.data.comment ?? null },
          ":now": new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(#field)",
      }),
    );
  } catch {
    return json(409, { error: "already_rated" });
  }

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE,
      Key: { userId: ratedUserId },
      UpdateExpression:
        "ADD ratingSum :stars, ratingCount :one SET updatedAt = :now",
      ExpressionAttributeValues: {
        ":stars": parsed.data.stars,
        ":one": 1,
        ":now": new Date().toISOString(),
      },
    }),
  );

  return json(200, { ok: true });
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
