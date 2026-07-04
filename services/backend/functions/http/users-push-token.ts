import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { getUserId } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const bodySchema = z.object({
  token: z.string().min(10).max(300),
});

/** POST /users/me/push-token – Expo-Push-Token des Geräts registrieren. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  if (!userId) return json(401, { error: "unauthorized" });

  const parsed = bodySchema.safeParse(safeJson(event.body));
  if (!parsed.success) return json(400, { error: "invalid_request" });

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE,
      Key: { userId },
      UpdateExpression: "SET expoPushToken = :t, updatedAt = :now",
      ExpressionAttributeValues: {
        ":t": parsed.data.token,
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
