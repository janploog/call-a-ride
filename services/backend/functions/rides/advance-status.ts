import { rideStatusSchema } from "@call-a-ride/core";
import { z } from "zod";
import { advanceRideStatus } from "../lib/rides";

const inputSchema = z.object({
  rideId: z.string(),
  riderId: z.string(),
  status: rideStatusSchema,
  driverId: z.string().optional(),
});

/**
 * Task der Ride-Statemachine: setzt den nächsten Fahrt-Status in DynamoDB
 * und benachrichtigt den Fahrgast über seine WebSocket-Verbindung(en).
 */
export const handler = async (rawInput: unknown) => {
  const input = inputSchema.parse(rawInput);
  await advanceRideStatus(input);
  return { rideId: input.rideId, riderId: input.riderId, status: input.status };
};
