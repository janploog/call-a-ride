import {
  CalculateRoutesCommand,
  GeoRoutesClient,
} from "@aws-sdk/client-geo-routes";
import { haversineDistanceMeters, type Coordinate } from "@call-a-ride/core";

const client = new GeoRoutesClient({});

// Fallback, falls Location Service nicht erreichbar/berechtigt ist:
// Luftlinie × Umwegfaktor, Fahrzeit über mittlere Stadtgeschwindigkeit.
const ROUTE_DETOUR_FACTOR = 1.3;
const AVG_CITY_SPEED_KMH = 25;

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  approximate: boolean;
}

export async function calculateRoute(
  pickup: Coordinate,
  dropoff: Coordinate,
): Promise<RouteResult> {
  try {
    const response = await client.send(
      new CalculateRoutesCommand({
        Origin: [pickup.lon, pickup.lat],
        Destination: [dropoff.lon, dropoff.lat],
        TravelMode: "Car",
      }),
    );
    const route = response.Routes?.[0];
    const summary = route?.Summary;
    if (summary?.Distance != null && summary?.Duration != null) {
      return {
        distanceMeters: Math.round(summary.Distance),
        durationSeconds: Math.round(summary.Duration),
        approximate: false,
      };
    }
    // Manche Antworten liefern die Summe nur auf Leg-Ebene
    const legs = route?.Legs ?? [];
    if (legs.length > 0) {
      let distance = 0;
      let duration = 0;
      for (const leg of legs) {
        distance += leg.VehicleLegDetails?.Summary?.Overview?.Distance ?? 0;
        duration += leg.VehicleLegDetails?.Summary?.Overview?.Duration ?? 0;
      }
      if (distance > 0) {
        return {
          distanceMeters: Math.round(distance),
          durationSeconds: Math.round(duration),
          approximate: false,
        };
      }
    }
    throw new Error("empty route response");
  } catch (err) {
    console.warn("CalculateRoutes failed, falling back to approximation", err);
    const distanceMeters = Math.round(
      haversineDistanceMeters(pickup, dropoff) * ROUTE_DETOUR_FACTOR,
    );
    return {
      distanceMeters,
      durationSeconds: Math.round((distanceMeters / 1000 / AVG_CITY_SPEED_KMH) * 3600),
      approximate: true,
    };
  }
}
