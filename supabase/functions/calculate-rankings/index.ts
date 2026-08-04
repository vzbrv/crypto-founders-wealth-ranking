import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";

const functionName = "calculate-rankings";
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
  if (
    !timingSafeEqual(request.headers.get("x-cron-secret") ?? "", cronSecret)
  ) {
    log("error", "unauthorized");
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const response = await fetch(
      new URL("/rest/v1/rpc/recalculate_rankings", supabaseUrl),
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_trigger_type: "scheduled" }),
      },
    );
    if (!response.ok) {
      log("error", "calculation_failed", {
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return json({ error: "Ranking calculation failed" }, 502);
    }

    const calculationRunId = await response.json();
    log("info", "calculation_complete", {
      calculationRunId,
      durationMs: Date.now() - startedAt,
    });
    return json({ calculationRunId });
  } catch (error) {
    log("error", "unexpected_error", {
      errorType: error instanceof Error ? error.name : "unknown",
      durationMs: Date.now() - startedAt,
    });
    return json({ error: "Ranking calculation failed" }, 502);
  }
});
