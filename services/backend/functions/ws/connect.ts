import type { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CONNECTION_TTL_SECONDS = 2 * 60 * 60;

// TODO (Phase 1): Verbindung über Cognito-JWT authentifizieren (Token als
// Query-Parameter beim Connect, Verifikation gegen den User Pool). Im
// Walking Skeleton wird die userId noch unverifiziert entgegengenommen.
export const handler: APIGatewayProxyHandler = async (event) => {
  const userId = event.queryStringParameters?.userId;
  if (!userId) {
    return { statusCode: 401, body: "missing userId" };
  }

  await ddb.send(
    new PutCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      Item: {
        connectionId: event.requestContext.connectionId,
        userId,
        connectedAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS,
      },
    }),
  );

  return { statusCode: 200, body: "connected" };
};
