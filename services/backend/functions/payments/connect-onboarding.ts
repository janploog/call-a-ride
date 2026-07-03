import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getStripe } from "../lib/stripe";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * POST /drivers/stripe-onboarding – legt (einmalig) ein Stripe-Connect-
 * Express-Konto für den Fahrer an und liefert den Onboarding-Link. Stripe
 * übernimmt KYC und Auszahlungen; account.updated-Webhooks pflegen den
 * payoutsEnabled-Status.
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

  let accountId = user?.stripeAccountId as string | undefined;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "DE",
      email: typeof email === "string" ? email : undefined,
      business_type: "individual",
      capabilities: { transfers: { requested: true } },
      metadata: { userId },
    });
    accountId = account.id;
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.USERS_TABLE,
        Key: { userId },
        UpdateExpression: "SET stripeAccountId = :a, updatedAt = :now",
        ExpressionAttributeValues: { ":a": accountId, ":now": new Date().toISOString() },
      }),
    );
  }

  const base = process.env.STRIPE_LINK_BASE_URL ?? "https://example.com";
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/stripe/refresh`,
    return_url: `${base}/stripe/return`,
    type: "account_onboarding",
  });

  return json(200, { url: link.url, accountId });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
