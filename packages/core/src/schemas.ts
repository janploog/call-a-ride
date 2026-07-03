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

export const driverLocationUpdateSchema = z.object({
  action: z.literal("locationUpdate"),
  position: coordinateSchema,
  headingDegrees: z.number().min(0).max(360).optional(),
});
export type DriverLocationUpdate = z.infer<typeof driverLocationUpdateSchema>;

/** Nachrichten, die der Server über die WebSocket-Verbindung an Clients sendet. */
export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("echo"), payload: z.unknown() }),
  z.object({
    type: z.literal("rideStatusChanged"),
    rideId: z.string(),
    status: rideStatusSchema,
  }),
  z.object({
    type: z.literal("driverPosition"),
    rideId: z.string(),
    position: coordinateSchema,
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
