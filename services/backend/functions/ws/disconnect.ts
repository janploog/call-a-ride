import type { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandler = async (event) => {
  await ddb.send(
    new DeleteCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      Key: { connectionId: event.requestContext.connectionId },
    }),
  );
  return { statusCode: 200, body: "disconnected" };
};
