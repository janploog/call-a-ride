import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getUserId } from "../lib/auth";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * GET /rides?role=rider|driver – die eigenen Fahrten, neueste zuerst.
 * Fahrgäste sehen ihre Historie inkl. Zahlungsstatus, Fahrer ihre Fahrten.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = getUserId(event);
  if (!userId) return json(401, { error: "unauthorized" });

  const role = event.queryStringParameters?.role === "driver" ? "driver" : "rider";
  const limit = Math.min(Number(event.queryStringParameters?.limit ?? 50), 100);

  const { Items = [] } = await ddb.send(
    new QueryCommand({
      TableName: process.env.RIDES_TABLE,
      IndexName: role === "driver" ? "byDriver" : "byRider",
      KeyConditionExpression: `${role === "driver" ? "driverId" : "riderId"} = :u`,
      ExpressionAttributeValues: { ":u": userId },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return json(200, {
    rides: Items.map((r) => ({
      rideId: r.rideId,
      status: r.status,
      pickupAddress: r.pickupAddress,
      dropoffAddress: r.dropoffAddress,
      distanceMeters: r.distanceMeters,
      estimatedFareCents: r.estimatedFareCents,
      paymentStatus: r.paymentStatus,
      createdAt: r.createdAt,
    })),
  });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
