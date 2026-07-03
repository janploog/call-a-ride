/**
 * Werte kommen aus den CDK-Stack-Outputs (car-<stage>-auth, -api, -realtime).
 * Lokal in apps/rider/.env pflegen — siehe .env.example.
 */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? "",
  userPoolId: process.env.EXPO_PUBLIC_USER_POOL_ID ?? "",
  userPoolClientId: process.env.EXPO_PUBLIC_USER_POOL_CLIENT_ID ?? "",
  /** Style-Descriptor-URL inkl. API-Key (Output des location-Stacks) */
  mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? "",
  /** Stripe Publishable Key (Testmodus: pk_test_…) */
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
};
