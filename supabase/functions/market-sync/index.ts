import { CoinGeckoAdapter } from "../../../packages/market-adapters/src/index.ts";

interface AssetRow {
  id: string;
  coingecko_id: string;
}

const jsonHeaders = { "content-type": "application/json" };
const adapter = new CoinGeckoAdapter({
  demoApiKey: Deno.env.get("COINGECKO_DEMO_API_KEY"),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function readError(response: Response): Promise<string> {
  const body = await response.text();
  return body || `HTTP ${response.status}`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase runtime secrets are unavailable" }, 500);
  }
  if (request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  const assetsUrl = new URL("/rest/v1/assets", supabaseUrl);
  assetsUrl.searchParams.set("select", "id,coingecko_id");
  assetsUrl.searchParams.set("is_active", "eq.true");
  assetsUrl.searchParams.set("coingecko_id", "not.is.null");

  const assetsResponse = await fetch(assetsUrl, { headers });
  if (!assetsResponse.ok) {
    return json(
      {
        error: "Unable to load market mappings",
        detail: await readError(assetsResponse),
      },
      502,
    );
  }
  const assets = (await assetsResponse.json()) as AssetRow[];
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
  if (!ingestResponse.ok) {
    return json(
      {
        error: "Unable to persist market sync",
        detail: await readError(ingestResponse),
      },
      502,
    );
  }

  const [ingestion] = (await ingestResponse.json()) as Array<{
    accepted_count: number;
    calculation_run_id: string | null;
  }>;
  return json(
    {
      providerStatus: result.health.status,
      accepted: ingestion?.accepted_count ?? 0,
      rejected: result.rejections.length,
      calculationRunId: ingestion?.calculation_run_id ?? null,
    },
    result.health.status === "failed" ? 502 : 200,
  );
});
