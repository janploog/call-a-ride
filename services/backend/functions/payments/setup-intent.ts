import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getStripe, STRIPE_API_VERSION } from "../lib/stripe";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * POST /payments/setup-intent – bereitet die PaymentSheet der Rider-App vor:
 * Stripe-Customer (einmalig) + Ephemeral Key + SetupIntent, damit der Fahrgast
 * eine Karte für spätere Off-Session-Zahlungen hinterlegen kann.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims.sub;
  const email = event.requestContext.authorizer.jwt.claims.email;
  if (typeof userId !== "string") {
    return json(401, { error: "unauthorized" });
  }

  const { stripe } = await getStripe();

  const { Item: user } = await ddb.send(
    new GetCommand({ TableName: process.env.USERS_TABLE, Key: { userId } }),
  );

  let customerId = user?.stripeCustomerId as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: typeof email === "string" ? email : undefined,
      metadata: { userId },
    });
    customerId = customer.id;
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.USERS_TABLE,
        Key: { userId },
        UpdateExpression: "SET stripeCustomerId = :c, updatedAt = :now",
        ExpressionAttributeValues: { ":c": customerId, ":now": new Date().toISOString() },
      }),
    );
  }

  const [ephemeralKey, setupIntent] = await Promise.all([
    stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: STRIPE_API_VERSION }),
    stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      automatic_payment_methods: { enabled: true },
    }),
  ]);

  return json(200, {
    customerId,
    ephemeralKeySecret: ephemeralKey.secret,
    setupIntentClientSecret: setupIntent.client_secret,
  });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
