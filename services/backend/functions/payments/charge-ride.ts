import type { EventBridgeEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { splitFare } from "@call-a-ride/core";
import { getPricingConfig } from "../lib/pricing-config";
import { getStripe } from "../lib/stripe";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface RideCompletedDetail {
  rideId: string;
  status: string;
}

/**
 * EventBridge-Target für ride.statusChanged (status=COMPLETED):
 * belastet die hinterlegte Karte des Fahrgasts off-session als Destination
 * Charge — Provision bleibt bei der Plattform, der Rest geht an das
 * Connect-Konto des Fahrers. Idempotent über ride.paymentStatus.
 */
export const handler = async (
  event: EventBridgeEvent<"ride.statusChanged", RideCompletedDetail>,
) => {
  const { rideId } = event.detail;

  const { Item: ride } = await ddb.send(
    new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId } }),
  );
  if (!ride || ride.status !== "COMPLETED") return;
  if (ride.paymentStatus) return; // bereits verarbeitet (Idempotenz)

  const [{ Item: rider }, { Item: driver }] = await Promise.all([
    ddb.send(
      new GetCommand({
        TableName: process.env.USERS_TABLE,
        Key: { userId: String(ride.riderId) },
      }),
    ),
    ddb.send(
      new GetCommand({
        TableName: process.env.USERS_TABLE,
        Key: { userId: String(ride.driverId ?? "") },
      }),
    ),
  ]);

  const customerId = rider?.stripeCustomerId as string | undefined;
  if (!customerId) {
    await setPaymentStatus(rideId, "NO_PAYMENT_METHOD");
    return;
  }

  const { stripe } = await getStripe();

  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 1,
  });
  const paymentMethod = paymentMethods.data[0];
  if (!paymentMethod) {
    await setPaymentStatus(rideId, "NO_PAYMENT_METHOD");
    return;
  }

  const totalCents = Number(ride.estimatedFareCents);
  const pricing = await getPricingConfig();
  const { platformFeeCents, driverPayoutCents } = splitFare(totalCents, pricing);
  const driverAccountId = driver?.stripeAccountId as string | undefined;

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: totalCents,
        currency: "eur",
        customer: customerId,
        payment_method: paymentMethod.id,
        off_session: true,
        confirm: true,
        description: `Call-a-Ride Fahrt ${rideId}`,
        metadata: { rideId },
        // Ohne fertiges Connect-Onboarding geht der Betrag zunächst komplett
        // an die Plattform (manueller Ausgleich); mit Konto: Destination Charge.
        ...(driverAccountId
          ? {
              application_fee_amount: platformFeeCents,
              transfer_data: { destination: driverAccountId },
            }
          : {}),
      },
      { idempotencyKey: `charge-${rideId}` },
    );

    await ddb.send(
      new UpdateCommand({
        TableName: process.env.RIDES_TABLE,
        Key: { rideId },
        UpdateExpression:
          "SET paymentStatus = :s, paymentIntentId = :pi, platformFeeCents = :fee, " +
          "driverPayoutCents = :payout, updatedAt = :now",
        ExpressionAttributeValues: {
          ":s": intent.status === "succeeded" ? "PAID" : "PROCESSING",
          ":pi": intent.id,
          ":fee": platformFeeCents,
          ":payout": driverAccountId ? driverPayoutCents : 0,
          ":now": new Date().toISOString(),
        },
      }),
    );
  } catch (err) {
    console.error(`charge for ride ${rideId} failed`, err);
    await setPaymentStatus(rideId, "FAILED");
  }
};

async function setPaymentStatus(rideId: string, status: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: process.env.RIDES_TABLE,
      Key: { rideId },
      UpdateExpression: "SET paymentStatus = :s, updatedAt = :now",
      ExpressionAttributeValues: { ":s": status, ":now": new Date().toISOString() },
    }),
  );
}
