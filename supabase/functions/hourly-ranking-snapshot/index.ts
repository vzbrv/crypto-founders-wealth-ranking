import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";
import { accumulatePartialResults, RetryableProviderError } from "./retry.ts";
import { computeEntryValuation } from "./valuation.ts";

type UnifiedSource = {
  id: string;
  category: string;
  name: string;
  date: string | null;
  url: string;
  quality: string;
  notes: string;
};

export type UnifiedEntry = {
  entryId: string;
  founderTeam: string;
  project: string;
  valueType: "Token/network" | "Public company";
  market:
    | {
        type: "token";
        sourceId: string;
        observationDate: string;
        coinGeckoCoinId: string;
      }
    | {
        type: "public";
        ticker: string;
        exchange: string;
        priceUsd: string;
        priceDate: string;
        priceSourceId: string;
        shareClasses: Array<{
          className: string;
          sharesOutstanding: string;
          asOfDate: string;
          sourceId: string;
        }>;
      };
  grossMarketValueUsd: string;
  affiliatedOwnership: {
    status: "Accepted" | "Unknown" | "Excluded";
    totalShares?: string;
    sourceId?: string;
    holders?: Array<{ name: string; shares: string; sourceId: string }>;
    notes: string;
  };
  outsideCapital: {
    status: "Accepted" | "Unknown";
    events: Array<{
      label: string;
      amountUsd: string;
      sourceId: string;
      disposition: "Accepted" | "Excluded" | "Disputed" | "Scenario-only";
      notes: string;
    }>;
    notes: string;
  };
  confidence: {
    score: number;
    label: string;
  };
  upperEstimate: boolean;
  unknowns: string[];
  disputedEvidence: string[];
};

export type UnifiedDocument = {
  snapshotDate: string;
  methodologyVersion: string;
  sources: UnifiedSource[];
  entries: UnifiedEntry[];
};

type CoinGeckoMarket = {
  id?: unknown;
  current_price?: unknown;
  circulating_supply?: unknown;
  market_cap?: unknown;
  last_updated?: unknown;
};

type YahooSparkResult = {
  symbol?: string;
  meta?: { regularMarketPrice?: number; regularMarketTime?: number };
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
};

const functionName = "hourly-ranking-snapshot";
const jsonHeaders = { "content-type": "application/json" };
const calculationVersion = "unified-v1-hourly";
const rankingMode = "unified_provisional";
const evidenceVersion = "reviewed-evidence-2026-07-30";
const tokenMaxStalenessSeconds = 2 * 60 * 60;
const publicMarketMaxStalenessSeconds = 7 * 24 * 60 * 60;
const quotaPausedStatus = "Paused — provider quota exhausted";
// One retry at 500ms, one more at 1.5s, before giving up — targets the
// specific failure mode where a provider's batch response silently omits
// one symbol (e.g. Yahoo Finance's spark endpoint dropping "COIN"), which
// otherwise aborts the entire hourly snapshot for a single flaky quote.
const providerRetryDelaysMs = [500, 1500];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function log(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
): void {
  console[level](
    JSON.stringify({ level, function: functionName, event, ...details }),
  );
}

function utcHour(now: Date): string {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
    ),
  ).toISOString();
}

function ageSeconds(observedAt: string, now: Date): number {
  const parsed = Date.parse(observedAt);
  if (!Number.isFinite(parsed))
    throw new Error("invalid observation timestamp");
  return Math.max(0, Math.floor((now.getTime() - parsed) / 1000));
}

function safeError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 180)
    : "hourly snapshot failed";
}

function asNumber(value: unknown, label: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} is not a valid non-negative number`);
  }
  return number;
}

function money(value: number): string {
  if (!Number.isFinite(value) || value < 0)
    throw new Error("invalid money value");
  return value.toFixed(2);
}

async function restJson<T>(
  url: URL,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`read failed (${response.status})`);
  return (await response.json()) as T;
}

async function rpc<T>(
  supabaseUrl: string,
  headers: Record<string, string>,
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, supabaseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name} failed (${response.status})`);
  return (await response.json()) as T;
}

async function recordFailure(
  supabaseUrl: string,
  headers: Record<string, string>,
  hour: string,
  provider: string,
  reason: string,
): Promise<void> {
  await rpc(supabaseUrl, headers, "record_hourly_snapshot_failure", {
    p_utc_hour: hour,
    p_provider: provider,
    p_reason: reason,
  }).catch(() => undefined);
}

async function reserveProviderRequest(
  supabaseUrl: string,
  headers: Record<string, string>,
  provider: string,
  endpoint: string,
  requestedAt: string,
): Promise<void> {
  const decision = await rpc<
    | { allowed?: boolean; condition?: string; code?: string }
    | Array<{ allowed?: boolean; condition?: string; code?: string }>
  >(supabaseUrl, headers, "reserve_provider_request", {
    p_provider: provider,
    p_request_count: 1,
    p_endpoint: endpoint,
    p_requested_at: requestedAt,
  });
  const row = Array.isArray(decision) ? decision[0] : decision;
  if (!row?.allowed) {
    throw new Error(
      `${quotaPausedStatus}: ${row?.condition ?? row?.code ?? "UPDATES_PAUSED"}`,
    );
  }
}

async function recordQuotaStop(
  supabaseUrl: string,
  headers: Record<string, string>,
  provider: string,
  condition: string,
  pausedAt: string,
): Promise<void> {
  await rpc(supabaseUrl, headers, "record_provider_quota_stop", {
    p_provider: provider,
    p_condition: condition,
    p_paused_at: pausedAt,
  });
}

export async function readUnifiedDocument(
  supabaseUrl: string,
  headers: Record<string, string>,
): Promise<UnifiedDocument> {
  const url = new URL("/rest/v1/unified_ranking_documents", supabaseUrl);
  url.searchParams.set("select", "dataset");
  url.searchParams.set("id", "eq.current");
  url.searchParams.set("limit", "1");
  const rows = await restJson<Array<{ dataset: UnifiedDocument }>>(
    url,
    headers,
  );
  const document = rows[0]?.dataset;
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(
      `unified ranking document is not a JSON object (got ${typeof document}); expected { entries: [...] } — check for double-encoded JSON in unified_ranking_documents.dataset`,
    );
  }
  if (!Array.isArray(document.entries) || document.entries.length !== 20) {
    throw new Error("unified ranking document is not a complete top 20");
  }
  return document;
}

export async function fetchCoinGecko(
  document: UnifiedDocument,
  supabaseUrl: string,
  headers: Record<string, string>,
  now: Date,
): Promise<{
  provider: string;
  checkedAt: string;
  sourceUrl: string;
  markets: Map<
    string,
    { price: number; supply: number; marketCap: number; observedAt: string }
  >;
}> {
  const entries = document.entries.filter(
    (entry) => entry.market.type === "token",
  );
  const ids = entries.map((entry) => entry.market.coinGeckoCoinId);
  if (new Set(ids).size !== ids.length)
    throw new Error("duplicate CoinGecko mapping");
  const sourceUrl = new URL("https://api.coingecko.com/api/v3/coins/markets");
  sourceUrl.searchParams.set("vs_currency", "usd");
  sourceUrl.searchParams.set("ids", ids.join(","));
  sourceUrl.searchParams.set("precision", "full");
  sourceUrl.searchParams.set("order", "market_cap_desc");
  sourceUrl.searchParams.set("per_page", "250");
  sourceUrl.searchParams.set("page", "1");
  sourceUrl.searchParams.set("sparkline", "false");
  const checkedAt = now.toISOString();
  await reserveProviderRequest(
    supabaseUrl,
    headers,
    "coingecko",
    "/coins/markets",
    checkedAt,
  );

  const fetchOnce = async (): Promise<
    Map<
      string,
      { price: number; supply: number; marketCap: number; observedAt: string }
    >
  > => {
    const response = await fetch(sourceUrl, {
      headers: Deno.env.get("COINGECKO_DEMO_API_KEY")
        ? { "x-cg-demo-api-key": Deno.env.get("COINGECKO_DEMO_API_KEY")! }
        : {},
    });
    if (!response.ok) {
      const condition = `HTTP_${response.status}_PROVIDER_LIMIT`;
      if ([402, 403, 429].includes(response.status)) {
        await recordQuotaStop(
          supabaseUrl,
          headers,
          "coingecko",
          condition,
          checkedAt,
        );
        throw new Error(`${quotaPausedStatus}: coingecko ${condition}`);
      }
      throw new RetryableProviderError(
        `CoinGecko returned HTTP ${response.status}`,
      );
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload))
      throw new Error("CoinGecko response must be an array");
    const markets = new Map<
      string,
      { price: number; supply: number; marketCap: number; observedAt: string }
    >();
    for (const item of payload as CoinGeckoMarket[]) {
      if (typeof item.id !== "string") continue;
      const observedAt =
        typeof item.last_updated === "string" &&
        Number.isFinite(Date.parse(item.last_updated))
          ? new Date(item.last_updated).toISOString()
          : checkedAt;
      markets.set(item.id, {
        price: asNumber(item.current_price, `${item.id} price`),
        supply: asNumber(item.circulating_supply, `${item.id} supply`),
        marketCap: asNumber(item.market_cap, `${item.id} market cap`),
        observedAt,
      });
    }
    for (const [id, market] of [...markets]) {
      if (ageSeconds(market.observedAt, now) > tokenMaxStalenessSeconds) {
        // Treated the same as "not found" — excluding it here (rather than
        // throwing) lets the caller fall back to a carried-forward value,
        // same as a symbol CoinGecko omitted entirely.
        markets.delete(id);
      }
    }
    return markets;
  };

  const markets = await accumulatePartialResults(fetchOnce, ids, {
    delaysMs: providerRetryDelaysMs,
  });
  return {
    provider: "coingecko",
    checkedAt,
    sourceUrl: sourceUrl.toString(),
    markets,
  };
}

export async function fetchPublicPrices(
  document: UnifiedDocument,
  supabaseUrl: string,
  headers: Record<string, string>,
  now: Date,
): Promise<{
  provider: string;
  checkedAt: string;
  sourceUrl: string;
  prices: Map<string, { price: number; observedAt: string }>;
}> {
  const entries = document.entries.filter(
    (entry) => entry.market.type === "public",
  );
  const symbols = entries.map((entry) => entry.market.ticker);
  const sourceUrl = new URL(
    "https://query1.finance.yahoo.com/v7/finance/spark",
  );
  sourceUrl.searchParams.set("symbols", symbols.join(","));
  sourceUrl.searchParams.set("range", "5d");
  sourceUrl.searchParams.set("interval", "1d");
  const checkedAt = now.toISOString();
  await reserveProviderRequest(
    supabaseUrl,
    headers,
    "yahoo_finance",
    "/v7/finance/spark",
    checkedAt,
  );

  const fetchOnce = async (): Promise<
    Map<string, { price: number; observedAt: string }>
  > => {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: "application/json",
        "user-agent": "crypto-founders-ranking/1.0",
      },
    });
    if (!response.ok) {
      const condition = `HTTP_${response.status}_PROVIDER_LIMIT`;
      if ([402, 403, 429].includes(response.status)) {
        await recordQuotaStop(
          supabaseUrl,
          headers,
          "yahoo_finance",
          condition,
          checkedAt,
        );
        throw new Error(`${quotaPausedStatus}: yahoo_finance ${condition}`);
      }
      throw new RetryableProviderError(
        `public market provider returned HTTP ${response.status}`,
      );
    }
    const payload = (await response.json()) as {
      spark?: { result?: YahooSparkResult[] };
    };
    const prices = new Map<string, { price: number; observedAt: string }>();
    for (const result of payload.spark?.result ?? []) {
      if (!result.symbol) continue;
      const closes = result.indicators?.quote?.[0]?.close ?? [];
      const timestamps = result.timestamp ?? [];
      let index = -1;
      for (let candidate = closes.length - 1; candidate >= 0; candidate -= 1) {
        if (closes[candidate] !== null && closes[candidate] !== undefined) {
          index = candidate;
          break;
        }
      }
      const price =
        index >= 0 ? closes[index] : result.meta?.regularMarketPrice;
      const timestamp =
        index >= 0 ? timestamps[index] : result.meta?.regularMarketTime;
      if (price === null || price === undefined || timestamp === undefined)
        continue;
      prices.set(result.symbol, {
        price: asNumber(price, `${result.symbol} price`),
        observedAt: new Date(timestamp * 1000).toISOString(),
      });
    }
    for (const [symbol, quote] of [...prices]) {
      if (ageSeconds(quote.observedAt, now) > publicMarketMaxStalenessSeconds) {
        // Same rationale as fetchCoinGecko: excluded, not thrown — this
        // makes it eligible for the caller's carried-forward fallback
        // instead of aborting the whole run.
        prices.delete(symbol);
      }
    }
    return prices;
  };

  const prices = await accumulatePartialResults(fetchOnce, symbols, {
    delaysMs: providerRetryDelaysMs,
  });
  return {
    provider: "yahoo_finance",
    checkedAt,
    sourceUrl: sourceUrl.toString(),
    prices,
  };
}

function sourceTimestamp(date: string | null, fallback: string): string {
  if (!date) return fallback;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function sourceRecord(
  source: UnifiedSource,
  now: Date,
  sourceId: string,
  metadata: Record<string, unknown>,
) {
  const observedAt = sourceTimestamp(source.date, now.toISOString());
  return {
    source_id: sourceId,
    source_url: source.url,
    source_name: source.name,
    observed_at: observedAt,
    fetched_at: now.toISOString(),
    metadata: { ...metadata, quality: source.quality, notes: source.notes },
  };
}

export async function findLastKnownMarketInput(
  entryId: string,
  supabaseUrl: string,
  headers: Record<string, string>,
): Promise<{
  priceUsd: number;
  circulatingSupply: number | null;
  grossValueUsd: number | null;
  observedAt: string;
} | null> {
  let rows: Array<{
    price_usd: string | number | null;
    circulating_supply: string | number | null;
    gross_value_usd: string | number | null;
    observed_at: string | null;
  }>;
  try {
    rows = await rpc(supabaseUrl, headers, "get_last_known_market_input", {
      p_entry_id: entryId,
    });
  } catch {
    // A failed lookup just means no carry-forward is available — the
    // caller falls back to its existing "no prior value" error, same as
    // if this function had never been called.
    return null;
  }
  const row = rows[0];
  if (!row || row.price_usd === null || !row.observed_at) return null;
  return {
    priceUsd: asNumber(row.price_usd, `${entryId} carried-forward price`),
    circulatingSupply:
      row.circulating_supply === null
        ? null
        : asNumber(row.circulating_supply, `${entryId} carried-forward supply`),
    grossValueUsd:
      row.gross_value_usd === null
        ? null
        : asNumber(
            row.gross_value_usd,
            `${entryId} carried-forward gross value`,
          ),
    observedAt: row.observed_at,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    log("error", "configuration_error");
    return json({ error: "Server configuration error" }, 500);
  }
  if (
    !timingSafeEqual(request.headers.get("x-cron-secret") ?? "", cronSecret)
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  const now = new Date();
  const hour = utcHour(now);

  try {
    const document = await readUnifiedDocument(supabaseUrl, headers);
    const sourceById = new Map(
      document.sources.map((source) => [source.id, source]),
    );
    const [tokens, publicMarkets] = await Promise.all([
      fetchCoinGecko(document, supabaseUrl, headers, now),
      fetchPublicPrices(document, supabaseUrl, headers, now),
    ]);
    const resultRows: Record<string, unknown>[] = [];
    const inputRows: Record<string, unknown>[] = [];
    const sourceRows = new Map<string, Record<string, unknown>>();

    for (const entry of document.entries) {
      let observationAt: string;
      let marketProvider: string;
      let marketSourceUrl: string;
      let marketPrice: number | null = null;
      let circulatingSupply: number | null = null;
      let tokenMarketCap: number | null = null;
      let shareCountInputs: Record<string, unknown> = {};
      const marketSourceId = `market:${entry.entryId}`;

      let carriedForward = false;

      if (entry.market.type === "token") {
        const market = tokens.markets.get(entry.market.coinGeckoCoinId);
        if (market) {
          marketPrice = market.price;
          circulatingSupply = market.supply;
          tokenMarketCap = market.marketCap;
          observationAt = market.observedAt;
          marketProvider = tokens.provider;
          marketSourceUrl = tokens.sourceUrl;
        } else {
          const carried = await findLastKnownMarketInput(
            entry.entryId,
            supabaseUrl,
            headers,
          );
          if (!carried) {
            throw new Error(
              `missing token market for ${entry.entryId} and no prior published value to carry forward`,
            );
          }
          marketPrice = carried.priceUsd;
          circulatingSupply = carried.circulatingSupply;
          tokenMarketCap = carried.grossValueUsd ?? carried.priceUsd;
          observationAt = carried.observedAt;
          marketProvider = tokens.provider;
          marketSourceUrl = tokens.sourceUrl;
          carriedForward = true;
          log("warn", "carried_forward_market_data", {
            entryId: entry.entryId,
            marketType: "token",
            observationAt,
          });
        }
      } else {
        const quote = publicMarkets.prices.get(entry.market.ticker);
        if (quote) {
          marketPrice = quote.price;
          observationAt = quote.observedAt;
          marketProvider = publicMarkets.provider;
          marketSourceUrl = publicMarkets.sourceUrl;
        } else {
          const carried = await findLastKnownMarketInput(
            entry.entryId,
            supabaseUrl,
            headers,
          );
          if (!carried) {
            throw new Error(
              `missing public market for ${entry.entryId} and no prior published value to carry forward`,
            );
          }
          marketPrice = carried.priceUsd;
          observationAt = carried.observedAt;
          marketProvider = publicMarkets.provider;
          marketSourceUrl = publicMarkets.sourceUrl;
          carriedForward = true;
          log("warn", "carried_forward_market_data", {
            entryId: entry.entryId,
            marketType: "public",
            observationAt,
          });
        }
        shareCountInputs = {
          ticker: entry.market.ticker,
          exchange: entry.market.exchange,
          shareClasses: entry.market.shareClasses,
        };
      }

      // computeEntryValuation (supabase/functions/hourly-ranking-snapshot/valuation.ts)
      // is the single source of truth for gross/ownership/capital/final value —
      // see valuation.test.ts for the covered cases. Token gross value is the
      // provider-reported market cap (tokenMarketCap), not price * supply
      // recomputed locally — those can diverge from what the provider reports.
      const valuation = computeEntryValuation({
        entryId: entry.entryId,
        market:
          entry.market.type === "token"
            ? { type: "token", marketCap: tokenMarketCap! }
            : {
                type: "public",
                price: marketPrice,
                shareClasses: entry.market.shareClasses,
              },
        affiliatedOwnership: entry.affiliatedOwnership,
        outsideCapital: entry.outsideCapital,
      });
      const gross = valuation.grossValueUsd;
      const ownership = valuation.founderAffiliateDeductionUsd;
      const capital = valuation.outsideCapitalDeductionUsd;
      const finalValue = valuation.finalValueUsd;

      sourceRows.set(marketSourceId, {
        source_id: marketSourceId,
        source_url: marketSourceUrl,
        source_name: marketProvider,
        observed_at: observationAt,
        fetched_at: now.toISOString(),
        metadata: { entryId: entry.entryId, provider: marketProvider },
      });
      const sourceIds = [marketSourceId];
      const evidenceIds = new Set<string>();
      if (entry.market.type === "token") evidenceIds.add(entry.market.sourceId);
      else {
        evidenceIds.add(entry.market.priceSourceId);
        for (const shareClass of entry.market.shareClasses)
          evidenceIds.add(shareClass.sourceId);
      }
      if (entry.affiliatedOwnership.status === "Accepted") {
        if (entry.affiliatedOwnership.sourceId)
          evidenceIds.add(entry.affiliatedOwnership.sourceId);
        for (const holder of entry.affiliatedOwnership.holders ?? [])
          evidenceIds.add(holder.sourceId);
      }
      for (const event of entry.outsideCapital.events.filter(
        (candidate) => candidate.disposition === "Accepted",
      )) {
        evidenceIds.add(event.sourceId);
      }
      for (const evidenceId of evidenceIds) {
        const source = sourceById.get(evidenceId);
        if (!source) throw new Error(`missing evidence source ${evidenceId}`);
        const snapshotSourceId = `evidence:${evidenceId}`;
        sourceIds.push(snapshotSourceId);
        sourceRows.set(
          snapshotSourceId,
          sourceRecord(source, now, snapshotSourceId, {
            evidenceSourceId: evidenceId,
          }),
        );
      }

      const maxStaleness =
        entry.valueType === "Public company"
          ? publicMarketMaxStalenessSeconds
          : tokenMaxStalenessSeconds;
      const dataAge = ageSeconds(observationAt, now);
      inputRows.push({
        entry_id: entry.entryId,
        value_type: entry.valueType,
        token_price_usd:
          entry.market.type === "token" ? money(marketPrice!) : null,
        circulating_supply:
          entry.market.type === "token" ? money(circulatingSupply!) : null,
        public_company_price_usd:
          entry.market.type === "public" ? money(marketPrice!) : null,
        share_count_inputs: shareCountInputs,
        founder_affiliate_deduction_usd:
          ownership === null ? null : money(ownership),
        outside_capital_deduction_usd: capital === null ? null : money(capital),
        gross_value_usd: money(gross),
        original_observation_at: observationAt,
        data_age_seconds: dataAge,
        max_staleness_seconds: maxStaleness,
        freshness_status: dataAge > 90 * 60 ? "stale" : "current",
        source_ids: sourceIds,
        metadata: {
          founderTeam: entry.founderTeam,
          project: entry.project,
          market: entry.market,
          upperEstimate: entry.upperEstimate,
          unknowns: entry.unknowns,
          disputedEvidence: entry.disputedEvidence,
          evidenceVersion,
          carriedForwardMarketData: carriedForward,
        },
      });
      resultRows.push({
        entry_id: entry.entryId,
        rank: 0,
        value_type: entry.valueType,
        gross_value_usd: money(gross),
        final_value_usd: money(finalValue),
        confidence_score: entry.confidence.score,
        confidence_label: entry.confidence.label,
        calculation: {
          formula:
            entry.valueType === "Public company"
              ? "reconstructed public market capitalization - disclosed founder/affiliated equity value - reviewed pre-public outside capital"
              : "circulating token market value - verified affiliated holdings included in circulating supply - reviewed outside capital",
          calculationVersion,
          evidenceVersion,
          entryId: entry.entryId,
          founderTeam: entry.founderTeam,
          project: entry.project,
          market: entry.market,
          upperEstimate: entry.upperEstimate,
          ownership: ownership === null ? "Unknown" : money(ownership),
          outsideCapital: capital === null ? "Unknown" : money(capital),
          observationAt,
          sourceIds,
        },
        source_ids: sourceIds,
        _sort_value: finalValue,
      });
    }

    resultRows.sort(
      (left, right) => Number(right._sort_value) - Number(left._sort_value),
    );
    resultRows.forEach((row, index) => {
      row.rank = index + 1;
      delete row._sort_value;
    });
    if (
      resultRows.length !== 20 ||
      resultRows.some((row) => !row.final_value_usd)
    ) {
      throw new Error("ranking is not a complete top 20");
    }

    const snapshotId = await rpc<string>(
      supabaseUrl,
      headers,
      "publish_hourly_snapshot",
      {
        p_payload: {
          snapshot_id: crypto.randomUUID(),
          utc_hour: hour,
          observation_at: now.toISOString(),
          calculation_version: calculationVersion,
          ranking_mode: rankingMode,
          provider_health: {
            coingecko: {
              checkedAt: now.toISOString(),
              status: "healthy",
              freshness: "current",
            },
            yahoo_finance: {
              checkedAt: now.toISOString(),
              status: "healthy",
              freshness: "current",
            },
          },
          provider_health_records: [
            {
              provider: "coingecko",
              checked_at: now.toISOString(),
              status: "healthy",
              freshness: "current",
              safe_message: "Batched token market response validated",
            },
            {
              provider: "yahoo_finance",
              checked_at: now.toISOString(),
              status: "healthy",
              freshness: "current",
              safe_message: "Batched public-market response validated",
            },
          ],
          results: resultRows,
          inputs: inputRows,
          sources: [...sourceRows.values()],
        },
      },
    );
    log("info", "snapshot_published", {
      snapshotId,
      utcHour: hour,
      entryCount: resultRows.length,
      sourceCount: sourceRows.size,
      durationMs: Date.now() - startedAt,
    });
    return json({
      status: "published",
      snapshotId,
      utcHour: hour,
      entryCount: 20,
    });
  } catch (error) {
    const reason = safeError(error);
    const quotaPaused = reason.includes(quotaPausedStatus);
    await recordFailure(
      supabaseUrl,
      headers,
      hour,
      quotaPaused ? "provider-quota" : "hourly-ranking",
      reason,
    );
    log("error", quotaPaused ? "quota_paused" : "snapshot_failed", {
      reason,
      utcHour: hour,
      status: quotaPaused ? quotaPausedStatus : undefined,
      staleDataRetained: true,
      manualResumeRequired: quotaPaused,
      durationMs: Date.now() - startedAt,
    });
    return json(
      quotaPaused
        ? {
            error: "Provider quota exhausted",
            status: quotaPausedStatus,
            staleDataRetained: true,
            manualResumeRequired: true,
          }
        : { error: "Hourly update failed", staleDataRetained: true },
      quotaPaused ? 409 : 502,
    );
  }
});
