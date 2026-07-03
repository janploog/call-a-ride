import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { splitFare } from "@call-a-ride/core";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * GET /drivers/me/earnings – Verdienstübersicht des Fahrers über
 * abgeschlossene Fahrten (heute / laufende Woche / gesamt).
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const driverId = event.requestContext.authorizer.jwt.claims.sub;
  if (typeof driverId !== "string") {
    return json(401, { error: "unauthorized" });
  }

  const { Items = [] } = await ddb.send(
    new QueryCommand({
      TableName: process.env.RIDES_TABLE,
      IndexName: "byDriver",
      KeyConditionExpression: "driverId = :d",
      FilterExpression: "#status = :completed",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":d": driverId, ":completed": "COMPLETED" },
      ScanIndexForward: false,
      Limit: 500,
    }),
  );

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  // Montag als Wochenstart
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

  let todayCents = 0;
  let weekCents = 0;
  let totalCents = 0;
  for (const ride of Items) {
    const payout =
      typeof ride.driverPayoutCents === "number" && ride.driverPayoutCents > 0
        ? ride.driverPayoutCents
        : splitFare(Number(ride.estimatedFareCents)).driverPayoutCents;
    totalCents += payout;
    const createdAt = new Date(String(ride.createdAt));
    if (createdAt >= startOfWeek) weekCents += payout;
    if (createdAt >= startOfDay) todayCents += payout;
  }

  return json(200, {
    todayCents,
    weekCents,
    totalCents,
    completedRides: Items.length,
  });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
