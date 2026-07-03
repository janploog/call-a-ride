import { z } from "zod";

export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type Coordinate = z.infer<typeof coordinateSchema>;

export const rideStatusSchema = z.enum([
  "REQUESTED",
  "MATCHING",
  "ASSIGNED",
  "DRIVER_ARRIVING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_DRIVER_FOUND",
]);
export type RideStatus = z.infer<typeof rideStatusSchema>;

export const rideRequestSchema = z.object({
  pickup: coordinateSchema,
  dropoff: coordinateSchema,
  pickupAddress: z.string().min(1).max(300),
  dropoffAddress: z.string().min(1).max(300),
});
export type RideRequest = z.infer<typeof rideRequestSchema>;

export const rideSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
  driverId: z.string().optional(),
  status: rideStatusSchema,
  pickup: coordinateSchema,
  dropoff: coordinateSchema,
  pickupAddress: z.string(),
  dropoffAddress: z.string(),
  estimatedFareCents: z.number().int().nonnegative(),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Ride = z.infer<typeof rideSchema>;

/** Preiskonfiguration (config-Tabelle, Key "pricing"; Admin-editierbar). */
export const pricingConfigSchema = z.object({
  baseFareCents: z.number().int().nonnegative(),
  perKmCents: z.number().int().nonnegative(),
  perMinuteCents: z.number().int().nonnegative(),
  minimumFareCents: z.number().int().nonnegative(),
  commissionRate: z.number().min(0).max(0.5),
});

export const verificationStatusSchema = z.enum(["UNSUBMITTED", "PENDING", "APPROVED", "REJECTED"]);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const DRIVER_DOCUMENT_TYPES = [
  "fuehrerschein",
  "p-schein",
  "fahrzeugschein",
  "versicherung",
] as const;
export const driverDocumentTypeSchema = z.enum(DRIVER_DOCUMENT_TYPES);
export type DriverDocumentType = z.infer<typeof driverDocumentTypeSchema>;

/** Ergebnis der Adresssuche (GET /places/search). */
export const placeResultSchema = z.object({
  label: z.string(),
  position: coordinateSchema,
});
export type PlaceResult = z.infer<typeof placeResultSchema>;

/** Routen-/Preisschätzung vor der Buchung (GET /route). */
export const routeQuoteSchema = z.object({
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  estimatedFareCents: z.number().int().nonnegative(),
  /** true, wenn statt echter Route die Luftlinien-Näherung verwendet wurde */
  approximate: z.boolean(),
});
export type RouteQuote = z.infer<typeof routeQuoteSchema>;

/**
 * Client→Server über WebSocket: periodisches Positions-Update der Fahrer-App.
 * `available: false` (z. B. während einer Fahrt) nimmt den Fahrer aus dem
 * Matching; `activeRideId` leitet die Position live an den Fahrgast weiter.
 */
export const driverLocationUpdateSchema = z.object({
  action: z.literal("locationUpdate"),
  position: coordinateSchema,
  headingDegrees: z.number().min(0).max(360).optional(),
  available: z.boolean(),
  activeRideId: z.string().optional(),
});
export type DriverLocationUpdate = z.infer<typeof driverLocationUpdateSchema>;

/** Nachrichten, die der Server über die WebSocket-Verbindung an Clients sendet. */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("echo"), payload: z.unknown() }),
  z.object({
    type: z.literal("rideStatusChanged"),
    rideId: z.string(),
    status: rideStatusSchema,
    driverId: z.string().optional(),
  }),
  z.object({
    type: z.literal("driverPosition"),
    rideId: z.string(),
    position: coordinateSchema,
  }),
  z.object({
    type: z.literal("rideCancelled"),
    rideId: z.string(),
  }),
  z.object({
    type: z.literal("rideOffer"),
    rideId: z.string(),
    pickup: coordinateSchema,
    dropoff: coordinateSchema,
    pickupAddress: z.string(),
    dropoffAddress: z.string(),
    estimatedFareCents: z.number().int().nonnegative(),
    distanceMeters: z.number().nonnegative(),
    expiresInSeconds: z.number().int().positive(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
