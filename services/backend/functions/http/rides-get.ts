import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** GET /rides/{rideId} – nur für den Fahrgast der Fahrt (oder später: den Fahrer). */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims.sub;
  const rideId = event.pathParameters?.rideId;
  if (!rideId) {
    return json(400, { error: "missing_ride_id" });
  }

  const { Item: ride } = await ddb.send(
    new GetCommand({
      TableName: process.env.RIDES_TABLE,
      Key: { rideId },
    }),
  );

  if (!ride || (ride.riderId !== userId && ride.driverId !== userId)) {
    // Bewusst 404 statt 403: verrät nicht, dass die Fahrt existiert
    return json(404, { error: "not_found" });
  }

  return json(200, ride);
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
