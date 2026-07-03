import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { driverDocumentTypeSchema } from "@call-a-ride/core";
import { z } from "zod";
import { getUserId } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const bodySchema = z.object({
  documentType: driverDocumentTypeSchema,
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
});

/**
 * POST /drivers/documents/upload-url – presigned PUT für den Dokumenten-Upload.
 * Der Upload markiert das Dokument als eingereicht; sobald mindestens ein
 * Dokument vorliegt, wandert der Fahrer in die Verifizierungsqueue (PENDING).
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  if (!userId) return json(401, { error: "unauthorized" });

  const parsed = bodySchema.safeParse(safeJson(event.body));
  if (!parsed.success) {
    return json(400, { error: "invalid_request", details: parsed.error.flatten() });
  }
  const { documentType, contentType } = parsed.data;

  const extension = contentType === "application/pdf" ? "pdf" : contentType.split("/")[1];
  const key = `drivers/${userId}/${documentType}.${extension}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.DOCUMENTS_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE,
      Key: { userId },
      UpdateExpression:
        "SET documents = if_not_exists(documents, :empty), updatedAt = :now, " +
        "verificationStatus = if_not_exists(verificationStatus, :pending)",
      ExpressionAttributeValues: {
        ":empty": {},
        ":now": new Date().toISOString(),
        ":pending": "PENDING",
      },
    }),
  );
  await ddb.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE,
      Key: { userId },
      UpdateExpression: "SET documents.#dt = :key",
      ExpressionAttributeNames: { "#dt": documentType },
      ExpressionAttributeValues: { ":key": key },
    }),
  );

  return json(200, { uploadUrl, key });
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
