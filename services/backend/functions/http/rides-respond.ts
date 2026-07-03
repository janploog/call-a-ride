import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import { z } from "zod";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

const bodySchema = z.object({ accept: z.boolean() });

/**
 * POST /rides/{rideId}/respond – der angefragte Fahrer nimmt an oder lehnt ab.
 * Löst das wartende Task-Token der Statemachine aus; bei Timeout des Angebots
 * antwortet der Aufruf mit 409 (offer_expired).
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const driverId = event.requestContext.authorizer.jwt.claims.sub;
  const rideId = event.pathParameters?.rideId;
  if (typeof driverId !== "string" || !rideId) {
    return json(400, { error: "bad_request" });
  }
  const parsed = bodySchema.safeParse(safeJson(event.body));
  if (!parsed.success) {
    return json(400, { error: "invalid_request" });
  }

  const { Item: ride } = await ddb.send(
    new GetCommand({ TableName: process.env.RIDES_TABLE, Key: { rideId } }),
  );
  if (!ride || ride.offeredDriverId !== driverId) {
    return json(404, { error: "not_found" });
  }
  const taskToken = ride.offerTaskToken as string | undefined;
  if (!taskToken) {
    return json(409, { error: "offer_expired" });
  }

  try {
    await sfn.send(
      new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify({ accepted: parsed.data.accept, driverId }),
      }),
    );
  } catch {
    // Token bereits verbraucht oder Task in den Timeout gelaufen
    return json(409, { error: "offer_expired" });
  }

  await ddb.send(
    new UpdateCommand({
      TableName: process.env.RIDES_TABLE,
      Key: { rideId },
      UpdateExpression: "REMOVE offerTaskToken SET updatedAt = :now",
      ExpressionAttributeValues: { ":now": new Date().toISOString() },
    }),
  );

  return json(200, { ok: true, accepted: parsed.data.accept });
};

function safeJson(body: string | undefined): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
