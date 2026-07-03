import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import Stripe from "stripe";

/**
 * Für den Ephemeral Key der PaymentSheet: entspricht der vom SDK v22
 * gepinnten API-Version (stripe/esm/apiVersion).
 */
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

let cached: { stripe: Stripe; webhookSecret: string } | null = null;

/**
 * Stripe-Client mit Secret aus dem Secrets Manager (einmal pro Cold Start).
 * Secret-Format: {"secretKey":"sk_…","webhookSecret":"whsec_…"}
 */
export async function getStripe(): Promise<{ stripe: Stripe; webhookSecret: string }> {
  if (cached) return cached;
  const client = new SecretsManagerClient({});
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.STRIPE_SECRET_ARN }),
  );
  const parsed = JSON.parse(res.SecretString ?? "{}") as {
    secretKey?: string;
    webhookSecret?: string;
  };
  if (!parsed.secretKey) {
    throw new Error(
      "Stripe secretKey fehlt – Secret im Secrets Manager befüllen (siehe README)",
    );
  }
  cached = {
    stripe: new Stripe(parsed.secretKey),
    webhookSecret: parsed.webhookSecret ?? "",
  };
  return cached;
}
