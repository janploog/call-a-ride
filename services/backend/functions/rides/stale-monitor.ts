import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

/** Status → maximal tolerierte Zeit ohne Update (Minuten). */
const STALE_THRESHOLDS_MINUTES: Record<string, number> = {
  // Statemachine-Timeout ist 15 min – hängt eine Fahrt danach noch in
  // MATCHING, ist etwas schiefgelaufen
  REQUESTED: 30,
  MATCHING: 30,
  ASSIGNED: 60,
  DRIVER_ARRIVING: 90,
  IN_PROGRESS: 180,
};

/**
 * Periodischer Wächter (EventBridge-Schedule): findet Fahrten, die zu lange
 * in einem aktiven Status hängen (Fahrer reagiert nicht, App abgestürzt, …)
 * und meldet sie auf den Alarm-Topic. Bewusst kein Auto-Cancel — bei einer
 * womöglich laufenden Beförderung entscheidet ein Mensch.
 */
export const handler = async () => {
  const now = Date.now();
  const stale: Array<{ rideId: string; status: string; updatedAt: string }> = [];

  for (const [status, maxMinutes] of Object.entries(STALE_THRESHOLDS_MINUTES)) {
    const threshold = new Date(now - maxMinutes * 60_000).toISOString();
    const { Items = [] } = await ddb.send(
      new QueryCommand({
        TableName: process.env.RIDES_TABLE,
        IndexName: "byStatus",
        KeyConditionExpression: "#status = :s",
        FilterExpression: "updatedAt < :threshold",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":s": status, ":threshold": threshold },
        Limit: 100,
      }),
    );
    for (const ride of Items) {
      stale.push({
        rideId: String(ride.rideId),
        status,
        updatedAt: String(ride.updatedAt),
      });
    }
  }

  if (stale.length > 0) {
    await sns.send(
      new PublishCommand({
        TopicArn: process.env.ALARM_TOPIC_ARN,
        Subject: `Call-a-Ride: ${stale.length} hängende Fahrt(en)`,
        Message: [
          "Folgende Fahrten stecken ungewöhnlich lange in einem aktiven Status:",
          "",
          ...stale.map((r) => `- ${r.rideId}: ${r.status}, letztes Update ${r.updatedAt}`),
          "",
          "Bitte im Admin-Dashboard prüfen (stornieren/erstatten falls nötig).",
        ].join("\n"),
      }),
    );
  }

  return { staleCount: stale.length };
};
