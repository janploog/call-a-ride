import { fetchAuthSession } from "aws-amplify/auth";

const apiUrl = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("Keine gültige Sitzung");
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`API-Fehler ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export interface AdminDriver {
  userId: string;
  verificationStatus: string;
  documents: Record<string, string>;
  payoutsEnabled: boolean;
  blocked: boolean;
  updatedAt?: string;
}

export interface AdminRide {
  rideId: string;
  status: string;
  riderId: string;
  driverId?: string;
  pickupAddress: string;
  dropoffAddress: string;
  estimatedFareCents: number;
  paymentStatus?: string;
  createdAt: string;
}

export interface Pricing {
  baseFareCents: number;
  perKmCents: number;
  perMinuteCents: number;
  minimumFareCents: number;
  commissionRate: number;
}

export const api = {
  listDrivers: (status: string) =>
    request<{ drivers: AdminDriver[] }>(
      `/admin/drivers?status=${encodeURIComponent(status)}`,
    ),
  driverDocuments: (userId: string) =>
    request<{ documents: Record<string, string> }>(`/admin/drivers/${userId}/documents`),
  verifyDriver: (userId: string, decision: "APPROVED" | "REJECTED") =>
    request<{ ok: boolean }>(`/admin/drivers/${userId}/verify`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
  listRides: () => request<{ rides: AdminRide[] }>("/admin/rides?limit=100"),
  getPricing: () =>
    request<{ pricing: Pricing; isDefault: boolean }>("/admin/config/pricing"),
  savePricing: (pricing: Pricing) =>
    request<{ ok: boolean }>("/admin/config/pricing", {
      method: "PUT",
      body: JSON.stringify(pricing),
    }),
  blockUser: (userId: string, blocked: boolean) =>
    request<{ ok: boolean }>(`/admin/users/${userId}/block`, {
      method: "POST",
      body: JSON.stringify({ blocked }),
    }),
  refundRide: (rideId: string) =>
    request<{ ok: boolean }>(`/admin/rides/${rideId}/refund`, { method: "POST" }),
};
