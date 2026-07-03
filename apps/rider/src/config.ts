/**
 * Werte kommen aus den CDK-Stack-Outputs (car-<stage>-auth, -api, -realtime).
 * Lokal in apps/rider/.env pflegen — siehe .env.example.
 */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? "",
  userPoolId: process.env.EXPO_PUBLIC_USER_POOL_ID ?? "",
  userPoolClientId: process.env.EXPO_PUBLIC_USER_POOL_CLIENT_ID ?? "",
};
