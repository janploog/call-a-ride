import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

const client = new EventBridgeClient({});

export const RIDE_EVENT_SOURCE = "car.rides";

/**
 * Domain-Event auf den Default-Bus legen (z. B. für die Zahlung nach
 * Fahrtende). Fehler werden geloggt, aber nicht propagiert — der eigentliche
 * Statuswechsel ist zu diesem Zeitpunkt bereits persistiert.
 */
export async function emitRideEvent(
  detailType: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await client.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: RIDE_EVENT_SOURCE,
            DetailType: detailType,
            Detail: JSON.stringify(detail),
          },
        ],
      }),
    );
  } catch (err) {
    console.error("emitRideEvent failed", detailType, err);
  }
}
