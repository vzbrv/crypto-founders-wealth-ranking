import { createPublicClient, http, mainnet } from "viem";

import {
  EvmBalanceAdapter,
  SolanaBalanceAdapter,
  SolanaJsonRpcClient,
  type EvmBalanceQuery,
  type EvmMulticallResult,
  type EvmSyncResult,
  type SolanaBalanceQuery,
  type SolanaSyncResult,
} from "../../../packages/chain-adapters/src/index.ts";

interface WalletRow {
  address: string;
  chain_code: string;
}

interface AssetRow {
  chain_code: string;
  contract_address: string | null;
  decimals: number | null;
}

interface MappingRow {
  tracked_wallet_id: string;
  asset_id: string;
  balance_query_type: "native" | "erc20";
  token_identifier: string | null;
  tracked_wallets: WalletRow | WalletRow[];
  assets: AssetRow | AssetRow[];
}

const functionName = "sync-wallet-balances";
const jsonHeaders = { "content-type": "application/json" };
const safeFailureCodes = new Set([
  "WALLET_MAPPING_READ_FAILED",
  "ETHEREUM_RPC_UNAVAILABLE",
  "WALLET_INGEST_FAILED",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function related<T>(value: T | T[]): T | undefined {
  return Array.isArray(value) ? value[0] : value;
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
      p_provider: "wallet-refresh",
      p_error_code: code,
      p_error_message:
        "Wallet refresh failed; prior successful scores retained",
    }),
  }).catch(() => undefined);
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

  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };

  try {
    const mappingsUrl = new URL("/rest/v1/wallet_asset_mappings", supabaseUrl);
    mappingsUrl.searchParams.set(
      "select",
      "tracked_wallet_id,asset_id,balance_query_type,token_identifier,tracked_wallets!inner(address,chain_code),assets!inner(chain_code,contract_address,decimals)",
    );
    mappingsUrl.searchParams.set("tracked_wallets.status", "eq.active");
    mappingsUrl.searchParams.set("tracked_wallets.affects_score", "eq.true");
    mappingsUrl.searchParams.set(
      "tracked_wallets.review_status",
      "eq.approved_sufficient",
    );
    mappingsUrl.searchParams.set(
      "tracked_wallets.chain_code",
      "in.(ethereum,solana)",
    );
    mappingsUrl.searchParams.set("assets.is_active", "eq.true");
    mappingsUrl.searchParams.set("assets.chain_code", "in.(ethereum,solana)");

    const mappingsResponse = await fetch(mappingsUrl, { headers });
    if (!mappingsResponse.ok) {
      throw new Error("WALLET_MAPPING_READ_FAILED");
    }

    const mappings = (await mappingsResponse.json()) as MappingRow[];
    const evmQueries = mappings.flatMap<EvmBalanceQuery>((mapping) => {
      const wallet = related(mapping.tracked_wallets);
      const asset = related(mapping.assets);
      if (!wallet || !asset || wallet.chain_code !== "ethereum") return [];
      return [
        {
          trackedWalletId: mapping.tracked_wallet_id,
          assetId: mapping.asset_id,
          chainCode: wallet.chain_code,
          walletAddress: wallet.address,
          balanceQueryType: mapping.balance_query_type,
          tokenAddress:
            mapping.balance_query_type === "erc20"
              ? (mapping.token_identifier ?? asset.contract_address)
              : null,
          configuredDecimals: asset.decimals,
        },
      ];
    });
    const solanaQueries = mappings.flatMap<SolanaBalanceQuery>((mapping) => {
      const wallet = related(mapping.tracked_wallets);
      const asset = related(mapping.assets);
      if (
        !wallet ||
        !asset ||
        wallet.chain_code !== "solana" ||
        mapping.balance_query_type !== "native"
      )
        return [];
      return [
        {
          trackedWalletId: mapping.tracked_wallet_id,
          assetId: mapping.asset_id,
          chainCode: wallet.chain_code,
          walletAddress: wallet.address,
          balanceQueryType: "native",
          configuredDecimals: asset.decimals,
        },
      ];
    });

    const results: Array<EvmSyncResult | SolanaSyncResult> = [];
    const evmRpcUrl = Deno.env.get("EVM_ETHEREUM_RPC_URL");
    if (evmQueries.length > 0) {
      if (!evmRpcUrl) throw new Error("ETHEREUM_RPC_UNAVAILABLE");
      const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(evmRpcUrl),
      });
      results.push(
        await new EvmBalanceAdapter({
          client: {
            getBlock: () => publicClient.getBlock(),
            getBalance: (args) => publicClient.getBalance(args),
            multicall: async (args) =>
              (await publicClient.multicall(
                args,
              )) as readonly EvmMulticallResult[],
          },
        }).sync(evmQueries),
      );
    }
    if (solanaQueries.length > 0) {
      const solanaRpcUrl =
        Deno.env.get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com";
      results.push(
        await new SolanaBalanceAdapter({
          client: new SolanaJsonRpcClient(solanaRpcUrl),
        }).sync(solanaQueries),
      );
    }

    const ingestions: Array<{
      accepted_count: number;
      calculation_run_id: string | null;
    }> = [];
    for (const result of results) {
      const ingestResponse = await fetch(
        new URL("/rest/v1/rpc/ingest_wallet_sync", supabaseUrl),
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
        throw new Error("WALLET_INGEST_FAILED");
      }
      const [ingestion] = (await ingestResponse.json()) as typeof ingestions;
      if (ingestion) ingestions.push(ingestion);
    }

    const rejected = results.reduce(
      (total, result) => total + result.rejections.length,
      0,
    );
    const providerStatuses = results.map((result) => ({
      provider: result.health.provider,
      status: result.health.status,
    }));
    const response = {
      providerStatus: results.some(({ health }) => health.status === "failed")
        ? "failed"
        : results.some(({ health }) => health.status === "degraded")
          ? "degraded"
          : "healthy",
      providers: providerStatuses,
      mappings: evmQueries.length + solanaQueries.length,
      accepted: ingestions.reduce(
        (total, ingestion) => total + ingestion.accepted_count,
        0,
      ),
      rejected,
      calculationRunId: ingestions.at(-1)?.calculation_run_id ?? null,
    };
    log("info", "sync_complete", {
      ...response,
      durationMs: Date.now() - startedAt,
    });
    return json(response, response.providerStatus === "failed" ? 502 : 200);
  } catch (error) {
    const code =
      error instanceof Error && safeFailureCodes.has(error.message)
        ? error.message
        : "WALLET_SYNC_FAILED";
    await recordFailure(supabaseUrl, headers, code);
    log("error", "sync_failed", {
      code,
      durationMs: Date.now() - startedAt,
      staleDataRetained: true,
    });
    return json(
      { error: "Wallet refresh failed", staleDataRetained: true },
      502,
    );
  }
});
