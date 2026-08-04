import {
  CoinGeckoAdapter,
  ProviderQuotaStopError,
} from "../../../packages/market-adapters/src/index.ts";
import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";

interface AssetRow {
  id: string;
  coingecko_id: string;
}

const functionName = "sync-market-data";
const jsonHeaders = { "content-type": "application/json" };
const safeFailureCodes = new Set([
  "MARKET_MAPPING_READ_FAILED",
  "MARKET_INGEST_FAILED",
]);
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

async function recordFailure(
  supabaseUrl: string,
  headers: Record<string, string>,
  code: string,
): Promise<void> {
  await fetch(new URL("/rest/v1/rpc/record_provider_failure", supabaseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_provider: "coingecko",
      p_error_code: code,
      p_error_message:
        "Market refresh failed; prior successful scores retained",
    }),
  }).catch(() => undefined);
}

async function reserveProviderRequest(
  supabaseUrl: string,
  headers: Record<string, string>,
  requestedAt: string,
): Promise<void> {
  const response = await fetch(
    new URL("/rest/v1/rpc/reserve_provider_request", supabaseUrl),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_provider: "coingecko",
        p_request_count: 1,
        p_endpoint: "/coins/markets",
        p_requested_at: requestedAt,
      }),
    },
  );
  if (!response.ok) throw new ProviderQuotaStopError("QUOTA_GUARD_UNAVAILABLE");
  const payload = (await response.json().catch(() => null)) as
    | { allowed?: boolean; condition?: string; code?: string }
    | Array<{ allowed?: boolean; condition?: string; code?: string }>
    | null;
  const decision = Array.isArray(payload) ? payload[0] : payload;
  if (!decision?.allowed) {
    throw new ProviderQuotaStopError(
      decision?.condition ?? decision?.code ?? "UPDATES_PAUSED",
    );
  }
}

async function recordQuotaStop(
  supabaseUrl: string,
  headers: Record<string, string>,
  condition: string,
  pausedAt: string,
): Promise<void> {
  const response = await fetch(
    new URL("/rest/v1/rpc/record_provider_quota_stop", supabaseUrl),
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_provider: "coingecko",
        p_condition: condition,
        p_paused_at: pausedAt,
      }),
    },
  );
  if (!response.ok) throw new Error("QUOTA_STOP_RECORD_FAILED");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    log("error", "method_not_allowed", { method: request.method });
    return json({ error: "Method not allowed" }, 405);
  }

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
    log("error", "unauthorized");
    return json({ error: "Unauthorized" }, 401);
  }

  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };

  try {
    const assetsUrl = new URL("/rest/v1/assets", supabaseUrl);
    assetsUrl.searchParams.set("select", "id,coingecko_id");
    assetsUrl.searchParams.set("is_active", "eq.true");
    assetsUrl.searchParams.set("coingecko_id", "not.is.null");
    const assetsResponse = await fetch(assetsUrl, { headers });
    if (!assetsResponse.ok) throw new Error("MARKET_MAPPING_READ_FAILED");

    const assets = (await assetsResponse.json()) as AssetRow[];
    const adapter = new CoinGeckoAdapter({
      demoApiKey: Deno.env.get("COINGECKO_DEMO_API_KEY"),
      beforeRequest: ({ requestedAt }) =>
        reserveProviderRequest(supabaseUrl, headers, requestedAt),
      onPermanentStop: ({ condition, stoppedAt }) =>
        recordQuotaStop(supabaseUrl, headers, condition, stoppedAt),
    });
    const result = await adapter.sync(
      assets.map(({ id, coingecko_id }) => ({
        assetId: id,
        coingeckoId: coingecko_id,
      })),
    );

    const ingestResponse = await fetch(
      new URL("/rest/v1/rpc/ingest_market_sync", supabaseUrl),
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_observations: result.observations,
          p_health: result.health,
        }),
      },
    );
    if (!ingestResponse.ok) throw new Error("MARKET_INGEST_FAILED");

    const [ingestion] = (await ingestResponse.json()) as Array<{
      accepted_count: number;
      calculation_run_id: string | null;
    }>;
    const response = {
      providerStatus: result.health.status,
      accepted: ingestion?.accepted_count ?? 0,
      rejected: result.rejections.length,
      calculationRunId: ingestion?.calculation_run_id ?? null,
    };
    log("info", "sync_complete", {
      ...response,
      durationMs: Date.now() - startedAt,
    });
    return json(response, result.health.status === "failed" ? 502 : 200);
  } catch (error) {
    if (error instanceof ProviderQuotaStopError) {
      log("error", "quota_paused", {
        provider: "coingecko",
        condition: error.condition,
        status: quotaPausedStatus,
        staleDataRetained: true,
        manualResumeRequired: true,
        durationMs: Date.now() - startedAt,
      });
      return json(
        {
          error: "Provider quota exhausted",
          status: quotaPausedStatus,
          provider: "coingecko",
          condition: error.condition,
          staleDataRetained: true,
          manualResumeRequired: true,
        },
        409,
      );
    }
    const code =
      error instanceof Error && safeFailureCodes.has(error.message)
        ? error.message
        : "MARKET_SYNC_FAILED";
    await recordFailure(supabaseUrl, headers, code);
    log("error", "sync_failed", {
      code,
      durationMs: Date.now() - startedAt,
      staleDataRetained: true,
    });
    return json(
      { error: "Market refresh failed", staleDataRetained: true },
      502,
    );
  }
});
