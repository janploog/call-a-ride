import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { getUserId } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** GET /drivers/me – Verifizierungs- und Auszahlungsstatus für die Fahrer-App. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  if (!userId) return json(401, { error: "unauthorized" });

  const { Item: user } = await ddb.send(
    new GetCommand({ TableName: process.env.USERS_TABLE, Key: { userId } }),
  );

  return json(200, {
    verificationStatus: user?.verificationStatus ?? "UNSUBMITTED",
    payoutsEnabled: user?.payoutsEnabled === true,
    documents: user?.documents ?? {},
    ratingCount: user?.ratingCount ?? 0,
    ratingAverage:
      typeof user?.ratingSum === "number" && Number(user?.ratingCount) > 0
        ? Number(user.ratingSum) / Number(user.ratingCount)
        : null,
  });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
