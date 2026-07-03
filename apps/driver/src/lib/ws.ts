import {
  serverMessageSchema,
  type DriverLocationUpdate,
  type ServerMessage,
} from "@call-a-ride/core";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../config";

export interface DriverSocket {
  sendLocation: (update: Omit<DriverLocationUpdate, "action">) => void;
  close: () => void;
}

/**
 * Authentifizierte WebSocket-Verbindung der Fahrer-App: empfängt Angebote
 * (rideOffer) und sendet Positions-Updates. Löst erst nach erfolgreichem
 * Verbindungsaufbau auf, damit sendLocation sofort nutzbar ist.
 */
export async function openDriverSocket(
  onMessage: (message: ServerMessage) => void,
): Promise<DriverSocket> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("Keine gültige Sitzung");

  const ws = new WebSocket(`${config.wsUrl}?token=${encodeURIComponent(token)}`);

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WebSocket-Verbindung fehlgeschlagen"));
  });

  ws.onmessage = (event) => {
    try {
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
      if (parsed.success) onMessage(parsed.data);
    } catch {
      // Nicht-JSON-Nachrichten ignorieren
    }
  };

  return {
    sendLocation: (update) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "locationUpdate", ...update }));
      }
    },
    close: () => ws.close(),
  };
}
