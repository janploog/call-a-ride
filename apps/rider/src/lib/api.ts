import type { Coordinate, PlaceResult, Ride, RideRequest, RouteQuote } from "@call-a-ride/core";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../config";

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("Keine gültige Sitzung – bitte neu anmelden.");
  return fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

async function expectOk<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API-Fehler ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function searchPlaces(text: string, near: Coordinate): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    text,
    lat: String(near.lat),
    lon: String(near.lon),
  });
  const res = await authFetch(`/places/search?${params}`);
  const data = await expectOk<{ results: PlaceResult[] }>(res);
  return data.results;
}

export async function getQuote(from: Coordinate, to: Coordinate): Promise<RouteQuote> {
  const params = new URLSearchParams({
    fromLat: String(from.lat),
    fromLon: String(from.lon),
    toLat: String(to.lat),
    toLon: String(to.lon),
  });
  return expectOk(await authFetch(`/route?${params}`));
}

export async function createRide(request: RideRequest): Promise<Ride> {
  return expectOk(
    await authFetch("/rides", { method: "POST", body: JSON.stringify(request) }),
  );
}

export async function getRide(rideId: string): Promise<Ride> {
  return expectOk(await authFetch(`/rides/${rideId}`));
}

export interface SetupIntentResponse {
  customerId: string;
  ephemeralKeySecret: string;
  setupIntentClientSecret: string;
}

/** Bereitet die Stripe PaymentSheet zum Hinterlegen einer Karte vor. */
export async function createSetupIntent(): Promise<SetupIntentResponse> {
  return expectOk(await authFetch("/payments/setup-intent", { method: "POST" }));
}

export async function cancelRide(rideId: string): Promise<void> {
  await expectOk(await authFetch(`/rides/${rideId}/cancel`, { method: "POST" }));
}

export async function rateRide(rideId: string, stars: number): Promise<void> {
  await expectOk(
    await authFetch(`/rides/${rideId}/rating`, {
      method: "POST",
      body: JSON.stringify({ stars }),
    }),
  );
}
