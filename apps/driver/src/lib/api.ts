import type { Ride } from "@call-a-ride/core";
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

export async function getRide(rideId: string): Promise<Ride> {
  return expectOk(await authFetch(`/rides/${rideId}`));
}

/** Fahrtangebot annehmen oder ablehnen. Wirft bei abgelaufenem Angebot (409). */
export async function respondToOffer(rideId: string, accept: boolean): Promise<void> {
  await expectOk(
    await authFetch(`/rides/${rideId}/respond`, {
      method: "POST",
      body: JSON.stringify({ accept }),
    }),
  );
}

export async function updateRideStatus(
  rideId: string,
  status: "IN_PROGRESS" | "COMPLETED",
): Promise<void> {
  await expectOk(
    await authFetch(`/rides/${rideId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  );
}

/** Startet das Stripe-Connect-Onboarding und liefert die Onboarding-URL. */
export async function startStripeOnboarding(): Promise<string> {
  const data = await expectOk<{ url: string }>(
    await authFetch("/drivers/stripe-onboarding", { method: "POST" }),
  );
  return data.url;
}

export interface Earnings {
  todayCents: number;
  weekCents: number;
  totalCents: number;
  completedRides: number;
}

export async function getEarnings(): Promise<Earnings> {
  return expectOk(await authFetch("/drivers/me/earnings"));
}

export interface DriverProfile {
  verificationStatus: "UNSUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
  payoutsEnabled: boolean;
  documents: Record<string, string>;
  ratingCount: number;
  ratingAverage: number | null;
}

export async function getDriverProfile(): Promise<DriverProfile> {
  return expectOk(await authFetch("/drivers/me"));
}

/** Holt eine presigned Upload-URL und lädt das Dokument direkt zu S3 hoch. */
export async function uploadDocument(
  documentType: string,
  contentType: string,
  fileUri: string,
): Promise<void> {
  const { uploadUrl } = await expectOk<{ uploadUrl: string }>(
    await authFetch("/drivers/documents/upload-url", {
      method: "POST",
      body: JSON.stringify({ documentType, contentType }),
    }),
  );
  const file = await fetch(fileUri);
  const blob = await file.blob();
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload fehlgeschlagen (${res.status})`);
}
