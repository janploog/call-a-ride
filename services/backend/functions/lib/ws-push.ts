import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ServerMessage } from "@call-a-ride/core";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Sendet eine Nachricht an alle aktiven WebSocket-Verbindungen eines Nutzers.
 * Tote Verbindungen (GoneException) werden dabei aufgeräumt.
 */
export async function pushToUser(userId: string, message: ServerMessage): Promise<void> {
  const tableName = process.env.CONNECTIONS_TABLE;
  const endpoint = process.env.WS_ENDPOINT;
  if (!tableName || !endpoint) {
    throw new Error("CONNECTIONS_TABLE and WS_ENDPOINT must be set");
  }

  const { Items = [] } = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "byUser",
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    }),
  );

  const client = new ApiGatewayManagementApiClient({ endpoint });
  const data = JSON.stringify(message);

  await Promise.all(
    Items.map(async (item) => {
      const connectionId = item.connectionId as string;
      try {
        await client.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: data }));
      } catch (err) {
        if (err instanceof GoneException) {
          await ddb.send(
            new DeleteCommand({ TableName: tableName, Key: { connectionId } }),
          );
        } else {
          console.error(`push to ${connectionId} failed`, err);
        }
      }
    }),
  );
}
