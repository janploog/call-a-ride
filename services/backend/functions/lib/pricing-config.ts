import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  DEFAULT_PRICING,
  pricingConfigSchema,
  type PricingConfig,
} from "@call-a-ride/core";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const CACHE_TTL_MS = 60_000;
let cache: { config: PricingConfig; loadedAt: number } | null = null;

/**
 * Admin-konfigurierbare Preise aus der config-Tabelle (Key "pricing"),
 * mit DEFAULT_PRICING als Fallback und 60-s-Cache pro Lambda-Instanz.
 */
export async function getPricingConfig(): Promise<PricingConfig> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.config;
  }
  let config = DEFAULT_PRICING;
  try {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: process.env.CONFIG_TABLE,
        Key: { configKey: "pricing" },
      }),
    );
    if (Item) {
      const parsed = pricingConfigSchema.safeParse(Item.value);
      if (parsed.success) config = parsed.data;
    }
  } catch (err) {
    console.warn("pricing config load failed, using defaults", err);
  }
  cache = { config, loadedAt: Date.now() };
  return config;
}
