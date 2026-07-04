import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { verificationStatusSchema } from "@call-a-ride/core";
import { z } from "zod";
import { isAdmin } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const verifyBodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(500).optional(),
});

/**
 * Admin-Endpunkte für die Fahrer-Verifizierung:
 * - GET  /admin/drivers?status=PENDING            → Queue
 * - GET  /admin/drivers/{userId}/documents        → presigned GET-URLs
 * - POST /admin/drivers/{userId}/verify           → freischalten/ablehnen
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!isAdmin(event)) return json(403, { error: "forbidden" });

  const route = event.routeKey;

  if (route === "GET /admin/drivers") {
    const status = verificationStatusSchema.safeParse(
      event.queryStringParameters?.status ?? "PENDING",
    );
    if (!status.success) return json(400, { error: "invalid_status" });
    const { Items = [] } = await ddb.send(
      new QueryCommand({
        TableName: process.env.USERS_TABLE,
        IndexName: "byVerificationStatus",
        KeyConditionExpression: "verificationStatus = :s",
        ExpressionAttributeValues: { ":s": status.data },
        Limit: 100,
      }),
    );
    return json(200, {
      drivers: Items.map((u) => ({
        userId: u.userId,
        verificationStatus: u.verificationStatus,
        documents: u.documents ?? {},
        payoutsEnabled: u.payoutsEnabled === true,
        blocked: u.blocked === true,
        updatedAt: u.updatedAt,
      })),
    });
  }

  const userId = event.pathParameters?.userId;
  if (!userId) return json(400, { error: "missing_user_id" });

  if (route === "GET /admin/drivers/{userId}/documents") {
    const { Items = [] } = await ddb.send(
      new QueryCommand({
        TableName: process.env.USERS_TABLE,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
      }),
    );
    const documents = (Items[0]?.documents ?? {}) as Record<string, string>;
    const urls: Record<string, string> = {};
    for (const [docType, key] of Object.entries(documents)) {
      urls[docType] = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: process.env.DOCUMENTS_BUCKET, Key: key }),
        { expiresIn: 600 },
      );
    }
    return json(200, { documents: urls });
  }

  if (route === "POST /admin/drivers/{userId}/verify") {
    const parsed = verifyBodySchema.safeParse(safeJson(event.body));
    if (!parsed.success) return json(400, { error: "invalid_request" });
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.USERS_TABLE,
        Key: { userId },
        UpdateExpression:
          "SET verificationStatus = :s, verificationNote = :note, updatedAt = :now",
        ExpressionAttributeValues: {
          ":s": parsed.data.decision,
          ":note": parsed.data.note ?? null,
          ":now": new Date().toISOString(),
        },
        ConditionExpression: "attribute_exists(userId)",
      }),
    );
    return json(200, { ok: true, verificationStatus: parsed.data.decision });
  }

  return json(404, { error: "route_not_found" });
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
