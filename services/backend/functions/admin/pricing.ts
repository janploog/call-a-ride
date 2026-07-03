import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_PRICING, pricingConfigSchema } from "@call-a-ride/core";
import { isAdmin } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * GET/PUT /admin/config/pricing – Preise und Provision zur Laufzeit anpassen.
 * Wirkt über den 60-s-Cache der Lambdas innerhalb einer Minute.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!isAdmin(event)) return json(403, { error: "forbidden" });

  if (event.requestContext.http.method === "GET") {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: process.env.CONFIG_TABLE,
        Key: { configKey: "pricing" },
      }),
    );
    const parsed = pricingConfigSchema.safeParse(Item?.value);
    return json(200, {
      pricing: parsed.success ? parsed.data : DEFAULT_PRICING,
      isDefault: !parsed.success,
    });
  }

  const parsed = pricingConfigSchema.safeParse(safeJson(event.body));
  if (!parsed.success) {
    return json(400, { error: "invalid_request", details: parsed.error.flatten() });
  }
  await ddb.send(
    new PutCommand({
      TableName: process.env.CONFIG_TABLE,
      Item: {
        configKey: "pricing",
        value: parsed.data,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return json(200, { ok: true, pricing: parsed.data });
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
