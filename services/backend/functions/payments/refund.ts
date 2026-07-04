import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { isAdmin } from "../lib/auth";
import { getStripe } from "../lib/stripe";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * POST /admin/rides/{rideId}/refund – vollständige Erstattung einer bezahlten
 * Fahrt. reverse_transfer + refund_application_fee holen bei Destination
 * Charges auch den Fahreranteil und die Provision zurück.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  if (!isAdmin(event)) return json(403, { error: "forbidden" });

  const rideId = event.pathParameters?.rideId;
  if (!rideId) return json(400, { error: "missing_ride_id" });

  const { Item: ride } = await ddb.send(
    new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId } }),
  );
  if (!ride) return json(404, { error: "not_found" });
  if (ride.paymentStatus !== "PAID" || typeof ride.paymentIntentId !== "string") {
    return json(409, { error: "not_refundable", paymentStatus: ride.paymentStatus });
  }

  const { stripe } = await getStripe();
  const hadTransfer = Number(ride.driverPayoutCents) > 0;
  await stripe.refunds.create(
    {
      payment_intent: ride.paymentIntentId,
      ...(hadTransfer ? { reverse_transfer: true, refund_application_fee: true } : {}),
      metadata: { rideId },
    },
    { idempotencyKey: `refund-${rideId}` },
  );

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.RIDES_TABLE,
      Key: { rideId },
      UpdateExpression: "SET paymentStatus = :s, updatedAt = :now",
      ExpressionAttributeValues: {
        ":s": "REFUNDED",
        ":now": new Date().toISOString(),
      },
    }),
  );

  return json(200, { ok: true, paymentStatus: "REFUNDED" });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
