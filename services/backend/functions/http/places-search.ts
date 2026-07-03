import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from "aws-lambda";
import { GeoPlacesClient, SearchTextCommand } from "@aws-sdk/client-geo-places";
import type { PlaceResult } from "@call-a-ride/core";
import { z } from "zod";

const client = new GeoPlacesClient({});

const querySchema = z.object({
  text: z.string().min(2).max(200),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

/**
 * GET /places/search – Adresssuche, als Proxy vor Amazon Location (geo-places),
 * damit die App keine eigenen AWS-Credentials für Places braucht.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  const parsed = querySchema.safeParse(event.queryStringParameters ?? {});
  if (!parsed.success) {
    return json(400, { error: "invalid_query", details: parsed.error.flatten() });
  }
  const { text, lat, lon } = parsed.data;

  const response = await client.send(
    new SearchTextCommand({
      QueryText: text,
      BiasPosition: [lon, lat],
      MaxResults: 5,
      Language: "de",
    }),
  );

  const results: PlaceResult[] = (response.ResultItems ?? []).flatMap((item) => {
    const position = item.Position;
    const label = item.Address?.Label ?? item.Title;
    if (!position || position.length < 2 || !label) return [];
    return [{ label, position: { lon: position[0]!, lat: position[1]! } }];
  });

  return json(200, { results });
};

function json(statusCode: number, payload: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
