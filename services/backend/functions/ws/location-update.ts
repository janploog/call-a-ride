import type { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { driverLocationUpdateSchema, encodeGeohash } from "@call-a-ride/core";
import { pushToUser } from "../lib/ws-push";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const LOCATION_TTL_SECONDS = 90;

/**
 * WS-Route "locationUpdate": Fahrer-Position in die Geohash-Tabelle schreiben
 * (alte Zelleinträge aufräumen) und während einer Fahrt live an den Fahrgast
 * weiterleiten.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  // Absender über die authentifizierte Verbindung ermitteln — niemals aus dem Payload
  const { Item: connection } = await ddb.send(
    new GetCommand({
      TableName: process.env.CONNECTIONS_TABLE,
      Key: { connectionId: event.requestContext.connectionId },
    }),
  );
  const driverId = connection?.userId as string | undefined;
  if (!driverId) {
    return { statusCode: 401, body: "unknown connection" };
  }

  const parsed = driverLocationUpdateSchema.safeParse(safeJson(event.body));
  if (!parsed.success) {
    return { statusCode: 400, body: "invalid payload" };
  }
  const { position, available, activeRideId } = parsed.data;

  // Nur verifizierte, nicht gesperrte Fahrer nehmen am Matching teil
  if (available) {
    const { Item: user } = await ddb.send(
      new GetCommand({
        TableName: process.env.USERS_TABLE,
        Key: { userId: driverId },
      }),
    );
    if (user?.verificationStatus !== "APPROVED" || user?.blocked === true) {
      return { statusCode: 403, body: "driver not verified or blocked" };
    }
  }

  const geohash = encodeGeohash(position);
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: process.env.DRIVER_LOCATIONS_TABLE,
      Item: {
        geohash,
        driverId,
        lat: position.lat,
        lon: position.lon,
        available,
        updatedAt: now,
        expiresAt: Math.floor(Date.now() / 1000) + LOCATION_TTL_SECONDS,
      },
    }),
  );

  // Einträge in vorherigen Zellen entfernen (Fahrer hat die Zelle gewechselt)
  const { Items: existing = [] } = await ddb.send(
    new QueryCommand({
      TableName: process.env.DRIVER_LOCATIONS_TABLE,
      IndexName: "byDriver",
      KeyConditionExpression: "driverId = :d",
      ExpressionAttributeValues: { ":d": driverId },
    }),
  );
  await Promise.all(
    existing
      .filter((item) => item.geohash !== geohash)
      .map((item) =>
        ddb.send(
          new DeleteCommand({
            TableName: process.env.DRIVER_LOCATIONS_TABLE,
            Key: { geohash: item.geohash, driverId },
          }),
        ),
      ),
  );

  // Während einer Fahrt: Position an den Fahrgast weiterleiten
  if (activeRideId) {
    const { Item: ride } = await ddb.send(
      new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId: activeRideId } }),
    );
    if (ride && ride.driverId === driverId) {
      await pushToUser(String(ride.riderId), {
        type: "driverPosition",
        rideId: activeRideId,
        position,
      });
    }
  }

  return { statusCode: 200, body: "ok" };
};

function safeJson(body: string | null | undefined): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}
