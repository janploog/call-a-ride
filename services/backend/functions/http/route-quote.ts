import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { coordinateSchema, estimateFareCents, type RouteQuote } from "@call-a-ride/core";
import { z } from "zod";
import { getPricingConfig } from "../lib/pricing-config";
import { calculateRoute } from "../lib/routing";

const querySchema = z.object({
  fromLat: z.coerce.number(),
  fromLon: z.coerce.number(),
  toLat: z.coerce.number(),
  toLon: z.coerce.number(),
});

/** GET /route – Preis-/Zeitschätzung vor der Buchung. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const parsed = querySchema.safeParse(event.queryStringParameters ?? {});
  if (!parsed.success) {
    return json(400, { error: "invalid_query", details: parsed.error.flatten() });
  }
  const pickup = coordinateSchema.safeParse({
    lat: parsed.data.fromLat,
    lon: parsed.data.fromLon,
  });
  const dropoff = coordinateSchema.safeParse({
    lat: parsed.data.toLat,
    lon: parsed.data.toLon,
  });
  if (!pickup.success || !dropoff.success) {
    return json(400, { error: "invalid_coordinates" });
  }

  const [route, pricing] = await Promise.all([
    calculateRoute(pickup.data, dropoff.data),
    getPricingConfig(),
  ]);
  const quote: RouteQuote = {
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    estimatedFareCents: estimateFareCents(
      route.distanceMeters,
      route.durationSeconds,
      pricing,
    ),
    approximate: route.approximate,
  };
  return json(200, quote);
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
