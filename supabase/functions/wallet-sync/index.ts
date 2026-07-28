import { createPublicClient, http, mainnet } from "viem";

import {
  EvmBalanceAdapter,
  type EvmBalanceQuery,
  type EvmMulticallResult,
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

const jsonHeaders = { "content-type": "application/json" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function related<T>(value: T | T[]): T | undefined {
  return Array.isArray(value) ? value[0] : value;
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
  const rpcUrl = Deno.env.get("EVM_ETHEREUM_RPC_URL");
  if (!supabaseUrl || !serviceRoleKey || !rpcUrl) {
    return json({ error: "Server-side runtime secrets are unavailable" }, 500);
  }
  if (request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  const mappingsUrl = new URL("/rest/v1/wallet_asset_mappings", supabaseUrl);
  mappingsUrl.searchParams.set(
    "select",
    "tracked_wallet_id,asset_id,balance_query_type,token_identifier,tracked_wallets!inner(address,chain_code),assets!inner(chain_code,contract_address,decimals)",
  );
  mappingsUrl.searchParams.set("tracked_wallets.status", "eq.active");
  mappingsUrl.searchParams.set("tracked_wallets.affects_score", "eq.true");
  mappingsUrl.searchParams.set("tracked_wallets.chain_code", "eq.ethereum");
  mappingsUrl.searchParams.set("assets.is_active", "eq.true");
  mappingsUrl.searchParams.set("assets.chain_code", "eq.ethereum");

  const mappingsResponse = await fetch(mappingsUrl, { headers });
  if (!mappingsResponse.ok) {
    return json(
      {
        error: "Unable to load wallet mappings",
        detail: await readError(mappingsResponse),
      },
      502,
    );
  }

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
  const adapter = new EvmBalanceAdapter({
    client: {
      getBlock: () => publicClient.getBlock(),
      getBalance: (args) => publicClient.getBalance(args),
      multicall: async (args) =>
        (await publicClient.multicall(args)) as readonly EvmMulticallResult[],
    },
  });
  const mappings = (await mappingsResponse.json()) as MappingRow[];
  const queries = mappings.flatMap<EvmBalanceQuery>((mapping) => {
    const wallet = related(mapping.tracked_wallets);
    const asset = related(mapping.assets);
    if (!wallet || !asset) return [];
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
  const result = await adapter.sync(queries);

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
    return json(
      {
        error: "Unable to persist wallet sync",
        detail: await readError(ingestResponse),
      },
      502,
    );
  }

  const [ingestion] = (await ingestResponse.json()) as Array<{
    accepted_count: number;
    calculation_run_id: string | null;
  }>;
  const response = {
    providerStatus: result.health.status,
    mappings: queries.length,
    accepted: ingestion?.accepted_count ?? 0,
    rejected: result.rejections.length,
    calculationRunId: ingestion?.calculation_run_id ?? null,
  };
  console.log(JSON.stringify({ event: "wallet_sync_complete", ...response }));
  return json(response, result.health.status === "failed" ? 502 : 200);
});
