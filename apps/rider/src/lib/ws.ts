import { serverMessageSchema, type ServerMessage } from "@call-a-ride/core";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../config";

/**
 * Öffnet die WebSocket-Verbindung des angemeldeten Nutzers und liefert
 * validierte Server-Nachrichten an den Callback. Rückgabe: close-Funktion.
 */
export async function openUserSocket(
  onMessage: (message: ServerMessage) => void,
): Promise<() => void> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("Keine gültige Sitzung");

  const ws = new WebSocket(`${config.wsUrl}?token=${encodeURIComponent(token)}`);
  ws.onmessage = (event) => {
    try {
      const parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
      if (parsed.success) onMessage(parsed.data);
    } catch {
      // Nicht-JSON-Nachrichten ignorieren
    }
  };
  return () => ws.close();
}
