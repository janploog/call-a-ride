import type { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID!,
  clientId: process.env.USER_POOL_CLIENT_ID!,
  tokenUse: "id",
});

const CONNECTION_TTL_SECONDS = 2 * 60 * 60;

/**
 * $connect: Cognito-ID-Token als Query-Parameter verifizieren; die userId
 * kommt aus dem Token (sub), nicht vom Client.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const token = event.queryStringParameters?.token;
  if (!token) {
    return { statusCode: 401, body: "missing token" };
  }

  let userId: string;
  try {
    const claims = await verifier.verify(token);
    userId = claims.sub;
  } catch {
    return { statusCode: 401, body: "invalid token" };
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
