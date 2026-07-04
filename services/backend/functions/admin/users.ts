import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { isAdmin } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const bodySchema = z.object({ blocked: z.boolean() });

/**
 * POST /admin/users/{userId}/block – Nutzer sperren/entsperren.
 * Gesperrte Fahrgäste können keine Fahrten anlegen, gesperrte Fahrer
 * nicht online gehen (Prüfung in rides-create bzw. location-update).
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!isAdmin(event)) return json(403, { error: "forbidden" });

  const userId = event.pathParameters?.userId;
  if (!userId) return json(400, { error: "missing_user_id" });

  const parsed = bodySchema.safeParse(safeJson(event.body));
  if (!parsed.success) return json(400, { error: "invalid_request" });

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE,
      Key: { userId },
      UpdateExpression: "SET blocked = :b, updatedAt = :now",
      ExpressionAttributeValues: {
        ":b": parsed.data.blocked,
        ":now": new Date().toISOString(),
      },
    }),
  );

  return json(200, { ok: true, blocked: parsed.data.blocked });
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
