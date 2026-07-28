import type { RankingEntry } from "./ranking";

export const COINBASE_WS_URL = "wss://advanced-trade-ws.coinbase.com";
export const LIVE_PRICE_MAX_VARIANCE_RATIO = 0.2;
export const LIVE_PRICE_STALE_AFTER_MS = 30_000;

const USD_PRODUCTS: Record<string, string> = {
  ADA: "ADA-USD",
  AVAX: "AVAX-USD",
  BTC: "BTC-USD",
  DOGE: "DOGE-USD",
  DOT: "DOT-USD",
  ETH: "ETH-USD",
  LINK: "LINK-USD",
  LTC: "LTC-USD",
  SOL: "SOL-USD",
  UNI: "UNI-USD",
  XRP: "XRP-USD",
};

export interface PriceTick {
  productId: string;
  priceUsd: number;
  observedAt: string;
}

export interface LiveProductPrice extends PriceTick {
  stale: boolean;
  varianceRatio: number;
}

export interface LiveEstimate {
  scoreUsd: number;
  liveProjectCount: number;
  stale: boolean;
}

export interface LiveProductConfig {
  productId: string;
  canonicalPriceUsd: number;
}

export function coinbaseProductId(symbol: string | null): string | null {
  return symbol ? (USD_PRODUCTS[symbol.trim().toUpperCase()] ?? null) : null;
}

export function collectLiveProducts(
  entries: RankingEntry[],
): LiveProductConfig[] {
  const products = new Map<string, LiveProductConfig>();
  for (const entry of entries) {
    for (const project of entry.projects) {
      const productId = coinbaseProductId(project.symbol);
      if (
        productId &&
        project.canonicalPriceUsd &&
        project.canonicalPriceUsd > 0
      ) {
        products.set(productId, {
          productId,
          canonicalPriceUsd: project.canonicalPriceUsd,
        });
      }
    }
  }
  return [...products.values()].sort((a, b) =>
    a.productId.localeCompare(b.productId),
  );
}

export function subscriptionMessages(productIds: string[]): string[] {
  if (!productIds.length) return [];
  return [
    JSON.stringify({
      type: "subscribe",
      product_ids: productIds,
      channel: "ticker_batch",
    }),
    JSON.stringify({ type: "subscribe", channel: "heartbeats" }),
  ];
}

export function parseCoinbaseMessage(raw: string): PriceTick[] {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!message || typeof message !== "object") return [];
  const record = message as Record<string, unknown>;
  if (record.channel !== "ticker" && record.channel !== "ticker_batch")
    return [];
  const timestamp =
    typeof record.timestamp === "string" ? Date.parse(record.timestamp) : NaN;
  const observedAt = Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : new Date().toISOString();
  if (!Array.isArray(record.events)) return [];

  return record.events.flatMap((event) => {
    if (!event || typeof event !== "object") return [];
    const tickers = (event as Record<string, unknown>).tickers;
    if (!Array.isArray(tickers)) return [];
    return tickers.flatMap((ticker) => {
      if (!ticker || typeof ticker !== "object") return [];
      const value = ticker as Record<string, unknown>;
      const priceUsd = Number(value.price);
      return typeof value.product_id === "string" &&
        Number.isFinite(priceUsd) &&
        priceUsd > 0
        ? [{ productId: value.product_id, priceUsd, observedAt }]
        : [];
    });
  });
}

export function reconcileLivePrice(
  tick: PriceTick,
  canonicalPriceUsd: number,
  maxVarianceRatio = LIVE_PRICE_MAX_VARIANCE_RATIO,
): { accepted: true; price: LiveProductPrice } | { accepted: false } {
  if (!(canonicalPriceUsd > 0) || !(tick.priceUsd > 0))
    return { accepted: false };
  const varianceRatio =
    Math.abs(tick.priceUsd - canonicalPriceUsd) / canonicalPriceUsd;
  return varianceRatio <= maxVarianceRatio
    ? { accepted: true, price: { ...tick, stale: false, varianceRatio } }
    : { accepted: false };
}

export function calculateEntryLiveEstimate(
  entry: RankingEntry,
  prices: ReadonlyMap<string, LiveProductPrice>,
): LiveEstimate | null {
  if (entry.scoreUsd === null) return null;
  let scoreUsd = entry.scoreUsd;
  let liveProjectCount = 0;
  let stale = false;

  for (const project of entry.projects) {
    const productId = coinbaseProductId(project.symbol);
    const price = productId ? prices.get(productId) : undefined;
    const outsideSupply =
      project.outsideHolderSupply ??
      (project.circulatingSupply !== null && project.excludedSupply !== null
        ? project.circulatingSupply - project.excludedSupply
        : null);
    if (
      !price ||
      outsideSupply === null ||
      project.capitalRaisedUsd === null ||
      project.canonicalScoreUsd === null
    ) {
      continue;
    }
    const liveProjectScore =
      price.priceUsd * Math.max(0, outsideSupply) - project.capitalRaisedUsd;
    scoreUsd +=
      (liveProjectScore - project.canonicalScoreUsd) *
      project.attributionFraction;
    liveProjectCount += 1;
    stale ||= price.stale;
  }

  return liveProjectCount ? { scoreUsd, liveProjectCount, stale } : null;
}
