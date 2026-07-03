import type { APIGatewayProxyHandler } from "aws-lambda";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import type { ServerMessage } from "@call-a-ride/core";

/**
 * $default-Route: Echo zurück an den Sender. Beweist im Walking Skeleton den
 * kompletten Rückkanal (App → WS-API → Lambda → Management-API → App); wird in
 * Phase 2 durch die echten Nachrichtentypen (locationUpdate etc.) ersetzt.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const { domainName, stage, connectionId } = event.requestContext;
  const client = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  const message: ServerMessage = {
    type: "echo",
    payload: safeJson(event.body),
  };

  await client.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(message),
    }),
  );

  return { statusCode: 200, body: "ok" };
};

function safeJson(body: string | null | undefined): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}
