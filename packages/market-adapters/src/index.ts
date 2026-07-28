import Decimal from "decimal.js";

const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

export interface MarketAsset {
  assetId: string;
  coingeckoId: string;
}

export interface MarketObservation {
  assetId: string;
  coingeckoId: string;
  provider: "coingecko";
  observedAt: string;
  fetchedAt: string;
  priceUsd: string;
  circulatingSupply: string;
  marketCapUsd: string;
  rawPayload: Record<string, unknown>;
}

export interface MarketRejection {
  assetId: string;
  coingeckoId: string;
  code:
    | "duplicate_mapping"
    | "invalid_response"
    | "missing_asset"
    | "provider_failure";
  message: string;
}

export interface MarketSyncResult {
  observations: MarketObservation[];
  rejections: MarketRejection[];
  health: {
    provider: "coingecko";
    status: "healthy" | "degraded" | "failed";
    checkedAt: string;
    responseTimeMs: number;
    errorCode?: string;
    errorMessage?: string;
    metadata: Record<string, unknown>;
  };
}

export interface CoinGeckoAdapterOptions {
  fetch?: typeof fetch;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  batchSize?: number;
  timeoutMs?: number;
  maxRetries?: number;
  minRequestIntervalMs?: number;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
  demoApiKey?: string;
}

interface CoinGeckoMarket {
  id?: unknown;
  current_price?: unknown;
  circulating_supply?: unknown;
  market_cap?: unknown;
  last_updated?: unknown;
  [key: string]: unknown;
}

function decimalString(
  value: unknown,
  field: string,
  positive: boolean,
): string {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`${field} is not numeric`);
  }
  const decimal = new Decimal(value);
  if (
    !decimal.isFinite() ||
    (positive ? !decimal.isPositive() : decimal.isNegative())
  ) {
    throw new Error(`${field} is outside its valid range`);
  }
  return decimal.toFixed();
}

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

export class CoinGeckoAdapter {
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #random: () => number;
  readonly #batchSize: number;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #minRequestIntervalMs: number;
  readonly #circuitFailureThreshold: number;
  readonly #circuitCooldownMs: number;
  readonly #demoApiKey: string | undefined;
  #lastRequestAt = 0;
  #consecutiveFailures = 0;
  #circuitOpenUntil = 0;

  constructor(options: CoinGeckoAdapterOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? (() => new Date());
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#random = options.random ?? Math.random;
    this.#batchSize = Math.min(200, Math.max(1, options.batchSize ?? 200));
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#minRequestIntervalMs = options.minRequestIntervalMs ?? 1_200;
    this.#circuitFailureThreshold = options.circuitFailureThreshold ?? 3;
    this.#circuitCooldownMs = options.circuitCooldownMs ?? 60_000;
    this.#demoApiKey = options.demoApiKey;
  }

  async sync(assets: MarketAsset[]): Promise<MarketSyncResult> {
    const startedAt = Date.now();
    const checkedAt = this.#now().toISOString();
    const observations: MarketObservation[] = [];
    const rejections: MarketRejection[] = [];
    const uniqueAssets: MarketAsset[] = [];
    const seen = new Set<string>();

    for (const asset of assets) {
      if (seen.has(asset.coingeckoId)) {
        rejections.push({
          ...asset,
          code: "duplicate_mapping",
          message: "CoinGecko mapping must be unique",
        });
      } else {
        seen.add(asset.coingeckoId);
        uniqueAssets.push(asset);
      }
    }

    if (Date.now() < this.#circuitOpenUntil) {
      const message = "CoinGecko circuit breaker is open";
      return this.#failureResult(
        uniqueAssets,
        rejections,
        checkedAt,
        startedAt,
        "circuit_open",
        message,
      );
    }

    for (const batch of chunks(uniqueAssets, this.#batchSize)) {
      try {
        const response = await this.#requestBatch(
          batch.map(({ coingeckoId }) => coingeckoId),
        );
        const byId = new Map<string, CoinGeckoMarket>();
        for (const item of response) {
          if (typeof item.id === "string") byId.set(item.id, item);
        }

        for (const asset of batch) {
          const item = byId.get(asset.coingeckoId);
          if (!item) {
            rejections.push({
              ...asset,
              code: "missing_asset",
              message: "Provider omitted the requested asset",
            });
            continue;
          }
          try {
            const observedAt =
              typeof item.last_updated === "string" &&
              !Number.isNaN(Date.parse(item.last_updated))
                ? new Date(item.last_updated).toISOString()
                : checkedAt;
            observations.push({
              assetId: asset.assetId,
              coingeckoId: asset.coingeckoId,
              provider: "coingecko",
              observedAt,
              fetchedAt: checkedAt,
              priceUsd: decimalString(
                item.current_price,
                "current_price",
                true,
              ),
              circulatingSupply: decimalString(
                item.circulating_supply,
                "circulating_supply",
                false,
              ),
              marketCapUsd: decimalString(item.market_cap, "market_cap", false),
              rawPayload: item,
            });
          } catch (error) {
            rejections.push({
              ...asset,
              code: "invalid_response",
              message:
                error instanceof Error
                  ? error.message
                  : "Invalid provider response",
            });
          }
        }
        this.#consecutiveFailures = 0;
      } catch (error) {
        this.#consecutiveFailures += 1;
        if (this.#consecutiveFailures >= this.#circuitFailureThreshold) {
          this.#circuitOpenUntil = Date.now() + this.#circuitCooldownMs;
        }
        const message =
          error instanceof Error ? error.message : "CoinGecko request failed";
        for (const asset of batch)
          rejections.push({ ...asset, code: "provider_failure", message });
      }
    }

    const failed = observations.length === 0 && uniqueAssets.length > 0;
    const degraded = !failed && rejections.length > 0;
    const firstFailure = rejections.find(
      ({ code }) => code === "provider_failure",
    );
    return {
      observations,
      rejections,
      health: {
        provider: "coingecko",
        status: failed ? "failed" : degraded ? "degraded" : "healthy",
        checkedAt,
        responseTimeMs: Date.now() - startedAt,
        ...(firstFailure
          ? { errorCode: firstFailure.code, errorMessage: firstFailure.message }
          : {}),
        metadata: {
          requested: assets.length,
          accepted: observations.length,
          rejected: rejections.length,
        },
      },
    };
  }

  async #requestBatch(ids: string[]): Promise<CoinGeckoMarket[]> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      const intervalWait = Math.max(
        0,
        this.#lastRequestAt + this.#minRequestIntervalMs - Date.now(),
      );
      if (intervalWait > 0) await this.#sleep(intervalWait);
      if (attempt > 0)
        await this.#sleep(
          250 * 2 ** (attempt - 1) + Math.floor(this.#random() * 100),
        );

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
      try {
        const url = new URL(`${COINGECKO_BASE_URL}/coins/markets`);
        url.searchParams.set("vs_currency", "usd");
        url.searchParams.set("ids", ids.join(","));
        url.searchParams.set("precision", "full");
        this.#lastRequestAt = Date.now();
        const response = await this.#fetch(url, {
          signal: controller.signal,
          ...(this.#demoApiKey
            ? { headers: { "x-cg-demo-api-key": this.#demoApiKey } }
            : {}),
        });
        if (!response.ok)
          throw new Error(`CoinGecko returned HTTP ${response.status}`);
        const payload: unknown = await response.json();
        if (!Array.isArray(payload))
          throw new Error("CoinGecko response must be an array");
        return payload as CoinGeckoMarket[];
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("CoinGecko request failed");
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError ?? new Error("CoinGecko request failed");
  }

  #failureResult(
    assets: MarketAsset[],
    rejections: MarketRejection[],
    checkedAt: string,
    startedAt: number,
    errorCode: string,
    errorMessage: string,
  ): MarketSyncResult {
    return {
      observations: [],
      rejections: [
        ...rejections,
        ...assets.map((asset) => ({
          ...asset,
          code: "provider_failure" as const,
          message: errorMessage,
        })),
      ],
      health: {
        provider: "coingecko",
        status: "failed",
        checkedAt,
        responseTimeMs: Date.now() - startedAt,
        errorCode,
        errorMessage,
        metadata: {
          requested: assets.length,
          accepted: 0,
          rejected: assets.length + rejections.length,
        },
      },
    };
  }
}
