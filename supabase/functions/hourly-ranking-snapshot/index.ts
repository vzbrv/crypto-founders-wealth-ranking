interface LeaderboardRow {
  rank: number | null;
  rank_change: number | null;
  score_usd: string | null;
  confidence_label: string | null;
  slug: string;
  project_breakdown: Array<{
    projectId: string;
    projectScoreUsd: string | null;
    attributedScoreUsd: string | null;
    attributionFraction: string;
    eligibilityStatus: string;
    ineligibilityReasons: string[];
  }>;
}

interface DetailRow {
  slug: string;
  project_type: string;
  market_cap_usd: string | null;
  capital_raised_usd: string | null;
  excluded_value_usd: string | null;
  price_usd: string | null;
  circulating_supply: string | null;
  calculation_breakdown: Record<string, unknown> | null;
  market_provider: string | null;
  market_source_url: string | null;
  market_observed_at: string | null;
  market_fetched_at: string | null;
  market_freshness_status: string | null;
  confidence_total: number | null;
  calculated_confidence_label: string | null;
}

const functionName = "hourly-ranking-snapshot";
const jsonHeaders = { "content-type": "application/json" };
const calculationVersion = "unified-v1-hourly";
const evidenceVersion = "reviewed-evidence-2026-07-30";
const maxStalenessSeconds = 2 * 60 * 60;
const quotaPausedStatus = "Paused — provider quota exhausted";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function log(
  level: "info" | "error",
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
  return Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(observedAt)) / 1000),
  );
}

function isHttps(value: string | null): value is string {
  return Boolean(value && value.startsWith("https://"));
}

function safeError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 120)
    : "hourly snapshot failed";
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

async function refreshMarketData(
  supabaseUrl: string,
  cronSecret: string,
): Promise<{
  providerStatus: string;
  accepted: number;
  quotaPaused?: boolean;
  provider?: string;
  condition?: string;
}> {
  const response = await fetch(
    new URL("/functions/v1/sync-market-data", supabaseUrl),
    {
      method: "POST",
      headers: { "x-cron-secret": cronSecret },
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    providerStatus?: string;
    accepted?: number;
    status?: string;
    provider?: string;
    condition?: string;
    manualResumeRequired?: boolean;
  };
  if (body.status === quotaPausedStatus || body.manualResumeRequired) {
    return {
      providerStatus: "paused",
      accepted: 0,
      quotaPaused: true,
      provider: body.provider ?? "coingecko",
      condition: body.condition ?? "UPDATES_PAUSED",
    };
  }
  if (!response.ok || body.providerStatus === "failed") {
    throw new Error("market provider failed");
  }
  return {
    providerStatus: body.providerStatus ?? "unknown",
    accepted: body.accepted ?? 0,
  };
}

function sourceFor(detail: DetailRow, now: Date, entryId: string) {
  if (!detail.market_source_url || !isHttps(detail.market_source_url)) {
    throw new Error(`missing source for ${entryId}`);
  }
  if (!detail.market_observed_at || !detail.market_fetched_at) {
    throw new Error(`missing timestamp for ${entryId}`);
  }
  const observedTime = Date.parse(detail.market_observed_at);
  const fetchedTime = Date.parse(detail.market_fetched_at);
  if (
    !Number.isFinite(observedTime) ||
    !Number.isFinite(fetchedTime) ||
    fetchedTime > now.getTime() + 300_000
  ) {
    throw new Error(`invalid timestamp for ${entryId}`);
  }
  const age = ageSeconds(detail.market_observed_at, now);
  if (age > maxStalenessSeconds)
    throw new Error(`stale required data for ${entryId}`);
  const sourceId = `market:${entryId}`;
  return {
    sourceId,
    source: {
      source_id: sourceId,
      source_url: detail.market_source_url,
      source_name: detail.market_provider ?? "approved market provider",
      observed_at: detail.market_observed_at,
      fetched_at: detail.market_fetched_at,
      metadata: { entryId },
    },
    age,
    freshness: age > 90 * 60 ? "stale" : "current",
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
  if (request.headers.get("x-cron-secret") !== cronSecret)
    return json({ error: "Unauthorized" }, 401);

  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  const now = new Date();
  const hour = utcHour(now);

  try {
    const market = await refreshMarketData(supabaseUrl, cronSecret);
    if (market.quotaPaused) {
      log("error", "quota_paused", {
        provider: market.provider,
        condition: market.condition,
        status: quotaPausedStatus,
        staleDataRetained: true,
        manualResumeRequired: true,
      });
      return json(
        {
          error: "Provider quota exhausted",
          status: quotaPausedStatus,
          provider: market.provider,
          condition: market.condition,
          staleDataRetained: true,
          manualResumeRequired: true,
        },
        409,
      );
    }
    await rpc(supabaseUrl, headers, "recalculate_rankings", {
      p_trigger_type: "hourly_snapshot",
    });

    const leaderboardUrl = new URL("/rest/v1/public_leaderboard", supabaseUrl);
    leaderboardUrl.searchParams.set(
      "select",
      "rank,rank_change,score_usd,confidence_label,slug,project_breakdown",
    );
    leaderboardUrl.searchParams.set("order", "rank.asc.nullslast");
    const leaderboard = await restJson<LeaderboardRow[]>(
      leaderboardUrl,
      headers,
    );
    if (leaderboard.length !== 20)
      throw new Error("ranking is not a complete top 20");

    const detailUrl = new URL("/rest/v1/public_project_details", supabaseUrl);
    detailUrl.searchParams.set("select", "*");
    const details = await restJson<DetailRow[]>(detailUrl, headers);
    const bySlug = new Map(details.map((detail) => [detail.slug, detail]));
    const seenRanks = new Set<number>();
    const results: Record<string, unknown>[] = [];
    const inputs: Record<string, unknown>[] = [];
    const sources: Record<string, unknown>[] = [];
    const sourceIds = new Set<string>();

    for (const row of leaderboard) {
      if (
        !row.rank ||
        seenRanks.has(row.rank) ||
        row.rank < 1 ||
        row.rank > 20 ||
        !row.score_usd
      ) {
        throw new Error("ranking has invalid ranks or values");
      }
      seenRanks.add(row.rank);
      if (!row.project_breakdown || row.project_breakdown.length !== 1) {
        throw new Error(`ambiguous calculation for ${row.slug}`);
      }
      const detail = bySlug.get(row.slug);
      if (!detail) throw new Error(`missing detail for ${row.slug}`);
      const source = sourceFor(detail, now, row.slug);
      sourceIds.add(source.sourceId);
      sources.push(source.source);

      const valueType =
        detail.project_type === "public_company"
          ? "Public company"
          : "Token/network";
      const shareCountInputs =
        detail.calculation_breakdown?.shareCountInputs ??
        detail.calculation_breakdown?.share_count_inputs ??
        {};
      const calculation = {
        formula:
          valueType === "Public company"
            ? "reconstructed public market capitalization - disclosed founder/affiliated equity value - reviewed pre-public outside capital"
            : "circulating token market value - verified affiliated holdings included in circulating supply - reviewed outside capital",
        calculationVersion,
        evidenceVersion,
        entryId: row.slug,
        sourceTimestamps: {
          observationAt: detail.market_observed_at,
          fetchedAt: detail.market_fetched_at,
        },
        projectBreakdown: row.project_breakdown[0],
      };
      const confidenceScore = detail.confidence_total;
      if (confidenceScore === null || !Number.isFinite(confidenceScore)) {
        throw new Error(`missing confidence for ${row.slug}`);
      }
      inputs.push({
        entry_id: row.slug,
        value_type: valueType,
        token_price_usd:
          valueType === "Token/network" ? detail.price_usd : null,
        circulating_supply:
          valueType === "Token/network" ? detail.circulating_supply : null,
        public_company_price_usd:
          valueType === "Public company" ? detail.price_usd : null,
        share_count_inputs:
          valueType === "Public company" ? shareCountInputs : {},
        founder_affiliate_deduction_usd: detail.excluded_value_usd,
        outside_capital_deduction_usd: detail.capital_raised_usd,
        gross_value_usd: detail.market_cap_usd,
        original_observation_at: detail.market_observed_at,
        data_age_seconds: source.age,
        max_staleness_seconds: maxStalenessSeconds,
        freshness_status: source.freshness,
        source_ids: [source.sourceId],
        metadata: {
          provider: detail.market_provider,
          evidenceVersion,
          calculation,
        },
      });
      results.push({
        entry_id: row.slug,
        rank: row.rank,
        rank_change: row.rank_change,
        value_type: valueType,
        gross_value_usd: detail.market_cap_usd,
        final_value_usd: row.score_usd,
        confidence_score: confidenceScore,
        confidence_label:
          detail.calculated_confidence_label ??
          row.confidence_label ??
          "insufficient",
        calculation,
        source_ids: [source.sourceId],
      });
    }
    if (seenRanks.size !== 20)
      throw new Error("ranking ranks are not contiguous");

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
          provider_health: {
            coingecko: {
              checkedAt: now.toISOString(),
              status: market.providerStatus,
              freshness: "current",
            },
          },
          provider_health_records: [
            {
              provider: "coingecko",
              checked_at: now.toISOString(),
              status: market.providerStatus,
              freshness: "current",
              safe_message: "Market provider response validated",
            },
          ],
          results,
          inputs,
          sources,
        },
      },
    );
    log("info", "snapshot_published", {
      snapshotId,
      utcHour: hour,
      sourceCount: sourceIds.size,
      durationMs: Date.now() - startedAt,
    });
    return json({ status: "published", snapshotId, utcHour: hour });
  } catch (error) {
    const reason = safeError(error);
    await recordFailure(
      supabaseUrl,
      headers,
      hour,
      "hourly-ranking",
      "Hourly update failed; previous snapshot retained",
    );
    log("error", "snapshot_failed", {
      reason,
      utcHour: hour,
      staleDataRetained: true,
      durationMs: Date.now() - startedAt,
    });
    return json(
      { error: "Hourly update failed", staleDataRetained: true },
      502,
    );
  }
});
