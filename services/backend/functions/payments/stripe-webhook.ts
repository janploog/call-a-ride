import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type Stripe from "stripe";
import { getStripe } from "../lib/stripe";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * POST /webhooks/stripe – signaturgeprüfte Stripe-Events:
 * - payment_intent.succeeded/failed → Zahlungsstatus der Fahrt
 * - account.updated → payoutsEnabled des Fahrers (Connect-Onboarding-Stand)
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const signature = event.headers["stripe-signature"];
  if (!signature || !event.body) {
    return { statusCode: 400, body: "missing signature or body" };
  }
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  const { stripe, webhookSecret } = await getStripe();

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return { statusCode: 400, body: "invalid signature" };
  }

  switch (stripeEvent.type) {
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const intent = stripeEvent.data.object;
      const rideId = intent.metadata?.rideId;
      if (rideId) {
        await ddb.send(
          new UpdateCommand({
            TableName: process.env.RIDES_TABLE,
            Key: { rideId },
            UpdateExpression: "SET paymentStatus = :s, updatedAt = :now",
            ExpressionAttributeValues: {
              ":s": stripeEvent.type === "payment_intent.succeeded" ? "PAID" : "FAILED",
              ":now": new Date().toISOString(),
            },
            ConditionExpression: "attribute_exists(rideId)",
          }),
        );
      }
      break;
    }
    case "account.updated": {
      const account = stripeEvent.data.object;
      const { Items = [] } = await ddb.send(
        new QueryCommand({
          TableName: process.env.USERS_TABLE,
          IndexName: "byStripeAccount",
          KeyConditionExpression: "stripeAccountId = :a",
          ExpressionAttributeValues: { ":a": account.id },
        }),
      );
      const user = Items[0];
      if (user) {
        await ddb.send(
          new UpdateCommand({
            TableName: process.env.USERS_TABLE,
            Key: { userId: user.userId },
            UpdateExpression: "SET payoutsEnabled = :p, updatedAt = :now",
            ExpressionAttributeValues: {
              ":p": account.payouts_enabled === true,
              ":now": new Date().toISOString(),
            },
          }),
        );
      }
      break;
    }
    default:
      break;
  }

  return { statusCode: 200, body: "ok" };
};
