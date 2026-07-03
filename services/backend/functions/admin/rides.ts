import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { isAdmin } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * GET /admin/rides – die letzten Fahrten chronologisch (byDate-Index),
 * optional ?status=… über den byStatus-Index.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!isAdmin(event)) return json(403, { error: "forbidden" });

  const status = event.queryStringParameters?.status;
  const limit = Math.min(Number(event.queryStringParameters?.limit ?? 50), 200);

  const { Items = [] } = await ddb.send(
    status
      ? new QueryCommand({
          TableName: process.env.RIDES_TABLE,
          IndexName: "byStatus",
          KeyConditionExpression: "#status = :s",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":s": status },
          ScanIndexForward: false,
          Limit: limit,
        })
      : new QueryCommand({
          TableName: process.env.RIDES_TABLE,
          IndexName: "byDate",
          KeyConditionExpression: "entityType = :e",
          ExpressionAttributeValues: { ":e": "RIDE" },
          ScanIndexForward: false,
          Limit: limit,
        }),
  );

  return json(200, { rides: Items });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
