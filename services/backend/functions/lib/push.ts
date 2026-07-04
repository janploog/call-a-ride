import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/**
 * Push-Benachrichtigung über den Expo Push Service — der zweite Kanal neben
 * WebSocket, damit Angebote und Statuswechsel auch bei geschlossener App
 * ankommen. Fehler werden nur geloggt: Push ist Best-Effort, die WebSocket-
 * Zustellung und der API-Zustand bleiben die Quelle der Wahrheit.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const { Item: user } = await ddb.send(
      new GetCommand({ TableName: process.env.USERS_TABLE, Key: { userId } }),
    );
    const token = user?.expoPushToken as string | undefined;
    if (!token) return;

    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: "default",
        priority: "high",
      }),
    });
    if (!res.ok) {
      console.warn(`expo push for ${userId} returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`expo push for ${userId} failed`, err);
  }
}
