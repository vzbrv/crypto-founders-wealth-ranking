interface ProviderStatus {
  provider: string;
  status: "healthy" | "degraded" | "failed";
  freshness: "current" | "stale";
  checked_at: string;
  latency_ms: number | null;
}

const functionName = "provider-health";
const jsonHeaders = { "content-type": "application/json" };

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
  if (request.headers.get("x-cron-secret") !== cronSecret) {
    log("error", "unauthorized");
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const url = new URL("/rest/v1/public_provider_status", supabaseUrl);
    url.searchParams.set(
      "select",
      "provider,status,freshness,checked_at,latency_ms",
    );
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!response.ok) {
      log("error", "health_read_failed", {
        upstreamStatus: response.status,
        durationMs: Date.now() - startedAt,
      });
      return json({ error: "Provider health read failed" }, 502);
    }

    const providers = (await response.json()) as ProviderStatus[];
    const status = providers.some(
      ({ status: providerStatus, freshness }) =>
        providerStatus === "failed" || freshness === "stale",
    )
      ? "degraded"
      : "healthy";
    log("info", "health_check_complete", {
      status,
      providerCount: providers.length,
      durationMs: Date.now() - startedAt,
    });
    return json({ status, providers }, status === "healthy" ? 200 : 503);
  } catch (error) {
    log("error", "unexpected_error", {
      errorType: error instanceof Error ? error.name : "unknown",
      durationMs: Date.now() - startedAt,
    });
    return json({ error: "Provider health read failed" }, 502);
  }
});
