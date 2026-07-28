import {
  erc20Abi,
  formatUnits,
  getAddress,
  type Address,
  type Hash,
} from "viem";

export type EvmBalanceQueryType = "native" | "erc20";

export interface EvmBalanceQuery {
  trackedWalletId: string;
  assetId: string;
  chainCode: string;
  walletAddress: string;
  balanceQueryType: EvmBalanceQueryType;
  tokenAddress?: string | null;
  configuredDecimals?: number | null;
}

export interface EvmBlock {
  number: bigint;
  hash: Hash | null;
  timestamp: bigint;
}

export interface EvmMulticallContract {
  address: Address;
  abi: typeof erc20Abi;
  functionName: "balanceOf" | "decimals";
  args?: readonly [Address];
}

export type EvmMulticallResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error?: unknown };

export interface EvmReadClient {
  getBlock(): Promise<EvmBlock>;
  getBalance(args: { address: Address; blockNumber: bigint }): Promise<bigint>;
  multicall(args: {
    allowFailure: true;
    blockNumber: bigint;
    contracts: readonly EvmMulticallContract[];
  }): Promise<readonly EvmMulticallResult[]>;
}

export interface EvmBalanceObservation {
  trackedWalletId: string;
  assetId: string;
  provider: "ethereum-rpc";
  blockNumber: string;
  blockHash: Hash;
  observedAt: string;
  fetchedAt: string;
  rawBalance: string;
  decimals: number;
  normalizedBalance: string;
  rawPayload: Record<string, unknown>;
}

export interface EvmBalanceRejection {
  trackedWalletId: string;
  assetId: string;
  code:
    | "decimals_mismatch"
    | "invalid_address"
    | "invalid_mapping"
    | "provider_failure"
    | "unsupported_chain";
  message: string;
}

export interface EvmSyncResult {
  observations: EvmBalanceObservation[];
  rejections: EvmBalanceRejection[];
  health: {
    provider: "ethereum-rpc";
    status: "healthy" | "degraded" | "failed";
    checkedAt: string;
    responseTimeMs: number;
    errorCode?: string;
    errorMessage?: string;
    metadata: Record<string, unknown>;
  };
}

export interface EvmBalanceAdapterOptions {
  client: EvmReadClient;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
}

interface PreparedQuery extends EvmBalanceQuery {
  wallet: Address;
  token?: Address;
}

function rejection(
  query: EvmBalanceQuery,
  code: EvmBalanceRejection["code"],
  message: string,
): EvmBalanceRejection {
  return {
    trackedWalletId: query.trackedWalletId,
    assetId: query.assetId,
    code,
    message,
  };
}

export class EvmBalanceAdapter {
  readonly #client: EvmReadClient;
  readonly #now: () => Date;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #maxRetries: number;

  constructor(options: EvmBalanceAdapterOptions) {
    this.#client = options.client;
    this.#now = options.now ?? (() => new Date());
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#maxRetries = Math.max(0, options.maxRetries ?? 2);
  }

  async sync(queries: EvmBalanceQuery[]): Promise<EvmSyncResult> {
    const startedAt = Date.now();
    const checkedAt = this.#now().toISOString();
    const observations: EvmBalanceObservation[] = [];
    const rejections: EvmBalanceRejection[] = [];
    const prepared: PreparedQuery[] = [];

    for (const query of queries) {
      if (query.chainCode !== "ethereum") {
        rejections.push(
          rejection(query, "unsupported_chain", "EVM chain is not supported"),
        );
        continue;
      }
      if (
        query.balanceQueryType !== "native" &&
        query.balanceQueryType !== "erc20"
      ) {
        rejections.push(
          rejection(query, "invalid_mapping", "Balance query type is invalid"),
        );
        continue;
      }
      try {
        const wallet = getAddress(query.walletAddress);
        if (query.balanceQueryType === "erc20") {
          if (!query.tokenAddress) throw new Error("missing token");
          prepared.push({
            ...query,
            wallet,
            token: getAddress(query.tokenAddress),
          });
        } else {
          prepared.push({ ...query, wallet });
        }
      } catch {
        rejections.push(
          rejection(
            query,
            "invalid_address",
            "Wallet or token address is invalid",
          ),
        );
      }
    }

    if (prepared.length === 0) {
      return this.#result(
        queries,
        observations,
        rejections,
        checkedAt,
        startedAt,
      );
    }

    let block: EvmBlock;
    try {
      block = await this.#retry(() => this.#client.getBlock());
      if (block.hash === null) throw new Error("missing block hash");
    } catch {
      for (const query of prepared) {
        rejections.push(
          rejection(query, "provider_failure", "Ethereum RPC request failed"),
        );
      }
      return this.#result(
        queries,
        observations,
        rejections,
        checkedAt,
        startedAt,
      );
    }

    const fetchedAt = this.#now().toISOString();
    const observedAt = new Date(Number(block.timestamp) * 1_000).toISOString();
    const blockHash = block.hash;

    const nativeQueries = prepared.filter(
      (query) => query.balanceQueryType === "native",
    );
    await Promise.all(
      nativeQueries.map(async (query) => {
        try {
          const rawBalance = await this.#retry(() =>
            this.#client.getBalance({
              address: query.wallet,
              blockNumber: block.number,
            }),
          );
          const decimals = query.configuredDecimals ?? 18;
          if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
            rejections.push(
              rejection(
                query,
                "invalid_mapping",
                "Configured decimals are invalid",
              ),
            );
            return;
          }
          observations.push(
            this.#observation(
              query,
              rawBalance,
              decimals,
              block.number,
              blockHash,
              observedAt,
              fetchedAt,
            ),
          );
        } catch {
          rejections.push(
            rejection(query, "provider_failure", "Ethereum RPC request failed"),
          );
        }
      }),
    );

    const tokenQueries = prepared.filter(
      (query): query is PreparedQuery & { token: Address } =>
        query.balanceQueryType === "erc20" && query.token !== undefined,
    );
    if (tokenQueries.length > 0) {
      const contracts = tokenQueries.flatMap<EvmMulticallContract>((query) => [
        {
          address: query.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [query.wallet],
        },
        {
          address: query.token,
          abi: erc20Abi,
          functionName: "decimals",
        },
      ]);

      try {
        const results = await this.#retry(() =>
          this.#client.multicall({
            allowFailure: true,
            blockNumber: block.number,
            contracts,
          }),
        );
        for (const [index, query] of tokenQueries.entries()) {
          const balanceResult = results[index * 2];
          const decimalsResult = results[index * 2 + 1];
          if (
            balanceResult?.status !== "success" ||
            typeof balanceResult.result !== "bigint" ||
            decimalsResult?.status !== "success" ||
            typeof decimalsResult.result !== "number"
          ) {
            rejections.push(
              rejection(
                query,
                "provider_failure",
                "Ethereum RPC multicall failed",
              ),
            );
            continue;
          }
          const decimals = decimalsResult.result;
          if (decimals < 0 || decimals > 18) {
            rejections.push(
              rejection(query, "invalid_mapping", "Token decimals are invalid"),
            );
            continue;
          }
          if (
            query.configuredDecimals !== null &&
            query.configuredDecimals !== undefined &&
            query.configuredDecimals !== decimals
          ) {
            rejections.push(
              rejection(
                query,
                "decimals_mismatch",
                "On-chain decimals do not match the configured asset",
              ),
            );
            continue;
          }
          observations.push(
            this.#observation(
              query,
              balanceResult.result,
              decimals,
              block.number,
              blockHash,
              observedAt,
              fetchedAt,
            ),
          );
        }
      } catch {
        for (const query of tokenQueries) {
          rejections.push(
            rejection(
              query,
              "provider_failure",
              "Ethereum RPC multicall failed",
            ),
          );
        }
      }
    }

    return this.#result(
      queries,
      observations,
      rejections,
      checkedAt,
      startedAt,
    );
  }

  #observation(
    query: PreparedQuery,
    rawBalance: bigint,
    decimals: number,
    blockNumber: bigint,
    blockHash: Hash,
    observedAt: string,
    fetchedAt: string,
  ): EvmBalanceObservation {
    return {
      trackedWalletId: query.trackedWalletId,
      assetId: query.assetId,
      provider: "ethereum-rpc",
      blockNumber: blockNumber.toString(),
      blockHash,
      observedAt,
      fetchedAt,
      rawBalance: rawBalance.toString(),
      decimals,
      normalizedBalance: formatUnits(rawBalance, decimals),
      rawPayload: {
        balanceQueryType: query.balanceQueryType,
        ...(query.token ? { tokenAddress: query.token } : {}),
      },
    };
  }

  async #retry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      if (attempt > 0) await this.#sleep(250 * 2 ** (attempt - 1));
      try {
        return await operation();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  #result(
    queries: EvmBalanceQuery[],
    observations: EvmBalanceObservation[],
    rejections: EvmBalanceRejection[],
    checkedAt: string,
    startedAt: number,
  ): EvmSyncResult {
    const providerFailure = rejections.some(
      ({ code }) => code === "provider_failure",
    );
    const failed =
      preparedCount(queries, rejections) > 0 &&
      observations.length === 0 &&
      providerFailure;
    const status = failed
      ? "failed"
      : rejections.length > 0
        ? "degraded"
        : "healthy";
    return {
      observations,
      rejections,
      health: {
        provider: "ethereum-rpc",
        status,
        checkedAt,
        responseTimeMs: Date.now() - startedAt,
        ...(providerFailure
          ? {
              errorCode: "provider_failure",
              errorMessage: "One or more Ethereum RPC reads failed",
            }
          : {}),
        metadata: {
          requested: queries.length,
          accepted: observations.length,
          rejected: rejections.length,
          preservedPriorBalances: providerFailure,
        },
      },
    };
  }
}

function preparedCount(
  queries: EvmBalanceQuery[],
  rejections: EvmBalanceRejection[],
): number {
  const validationFailures = rejections.filter(
    ({ code }) => code !== "provider_failure",
  ).length;
  return Math.max(0, queries.length - validationFailures);
}

const SOLANA_BASE58_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface SolanaBalanceQuery {
  trackedWalletId: string;
  assetId: string;
  chainCode: string;
  walletAddress: string;
  balanceQueryType: "native";
  configuredDecimals?: number | null;
}

export interface SolanaBalanceResult {
  context: { slot: number };
  value: bigint;
}

export interface SolanaBlock {
  blockhash: string;
  blockTime: number | null;
}

export interface SolanaReadClient {
  getBalance(args: {
    address: string;
    commitment: "finalized";
  }): Promise<SolanaBalanceResult>;
  getBlock(args: {
    slot: number;
    commitment: "finalized";
  }): Promise<SolanaBlock>;
}

export interface SolanaBalanceObservation {
  trackedWalletId: string;
  assetId: string;
  provider: "solana-rpc";
  blockNumber: string;
  blockHash: string;
  observedAt: string;
  fetchedAt: string;
  rawBalance: string;
  decimals: 9;
  normalizedBalance: string;
  rawPayload: { balanceQueryType: "native"; commitment: "finalized" };
}

export interface SolanaBalanceRejection {
  trackedWalletId: string;
  assetId: string;
  code:
    | "decimals_mismatch"
    | "invalid_address"
    | "invalid_mapping"
    | "provider_failure"
    | "unsupported_chain";
  message: string;
}

export interface SolanaSyncResult {
  observations: SolanaBalanceObservation[];
  rejections: SolanaBalanceRejection[];
  health: {
    provider: "solana-rpc";
    status: "healthy" | "degraded" | "failed";
    checkedAt: string;
    responseTimeMs: number;
    errorCode?: string;
    errorMessage?: string;
    metadata: Record<string, unknown>;
  };
}

interface SolanaRpcError {
  code?: number;
  message?: string;
}

interface SolanaRpcEnvelope<T> {
  result?: T;
  error?: SolanaRpcError;
}

export class SolanaJsonRpcClient implements SolanaReadClient {
  readonly #endpoint: string;
  readonly #fetch: typeof fetch;

  constructor(endpoint: string, fetchImplementation: typeof fetch = fetch) {
    this.#endpoint = endpoint;
    this.#fetch = fetchImplementation;
  }

  async getBalance(args: {
    address: string;
    commitment: "finalized";
  }): Promise<SolanaBalanceResult> {
    const text = await this.#request("getBalance", [
      args.address,
      { commitment: args.commitment },
    ]);
    const payload = this.#parse<{ context?: { slot?: number } }>(text);
    const slot = payload.result?.context?.slot;
    const valueMatch = /"value"\s*:\s*(\d+)/.exec(text);
    const rawValue = valueMatch?.[1];
    if (!Number.isSafeInteger(slot) || (slot ?? -1) < 0 || !rawValue) {
      throw new Error("Solana RPC returned an invalid balance");
    }
    return { context: { slot: slot as number }, value: BigInt(rawValue) };
  }

  async getBlock(args: {
    slot: number;
    commitment: "finalized";
  }): Promise<SolanaBlock> {
    const text = await this.#request("getBlock", [
      args.slot,
      {
        commitment: args.commitment,
        transactionDetails: "none",
        rewards: false,
        maxSupportedTransactionVersion: 0,
      },
    ]);
    const payload = this.#parse<SolanaBlock>(text);
    if (
      !payload.result ||
      !SOLANA_BASE58_PATTERN.test(payload.result.blockhash) ||
      (payload.result.blockTime !== null &&
        (!Number.isSafeInteger(payload.result.blockTime) ||
          payload.result.blockTime < 0))
    ) {
      throw new Error("Solana RPC returned an invalid block");
    }
    return payload.result;
  }

  async #request(method: string, params: unknown[]): Promise<string> {
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    } catch {
      throw new Error("Solana RPC request failed");
    }
    if (!response.ok) throw new Error("Solana RPC request failed");
    return response.text();
  }

  #parse<T>(text: string): SolanaRpcEnvelope<T> {
    let payload: SolanaRpcEnvelope<T>;
    try {
      payload = JSON.parse(text) as SolanaRpcEnvelope<T>;
    } catch {
      throw new Error("Solana RPC returned invalid JSON");
    }
    if (payload.error || payload.result === undefined) {
      throw new Error("Solana RPC request failed");
    }
    return payload;
  }
}

export interface SolanaBalanceAdapterOptions {
  client: SolanaReadClient;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  maxRetries?: number;
}

export class SolanaBalanceAdapter {
  readonly #client: SolanaReadClient;
  readonly #now: () => Date;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #maxRetries: number;

  constructor(options: SolanaBalanceAdapterOptions) {
    this.#client = options.client;
    this.#now = options.now ?? (() => new Date());
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#maxRetries = Math.max(0, options.maxRetries ?? 2);
  }

  async sync(queries: SolanaBalanceQuery[]): Promise<SolanaSyncResult> {
    const startedAt = Date.now();
    const checkedAt = this.#now().toISOString();
    const observations: SolanaBalanceObservation[] = [];
    const rejections: SolanaBalanceRejection[] = [];

    const prepared = queries.filter((query) => {
      let code: SolanaBalanceRejection["code"] | undefined;
      let message = "";
      if (query.chainCode !== "solana") {
        code = "unsupported_chain";
        message = "Solana chain is not supported";
      } else if (query.balanceQueryType !== "native") {
        code = "invalid_mapping";
        message = "Only native Solana balances are supported";
      } else if (!SOLANA_BASE58_PATTERN.test(query.walletAddress)) {
        code = "invalid_address";
        message = "Solana wallet address is invalid";
      } else if (
        query.configuredDecimals !== null &&
        query.configuredDecimals !== undefined &&
        query.configuredDecimals !== 9
      ) {
        code = "decimals_mismatch";
        message = "Native SOL decimals must be 9";
      }
      if (code) {
        rejections.push({
          trackedWalletId: query.trackedWalletId,
          assetId: query.assetId,
          code,
          message,
        });
        return false;
      }
      return true;
    });

    await Promise.all(
      prepared.map(async (query) => {
        try {
          const balance = await this.#retry(() =>
            this.#client.getBalance({
              address: query.walletAddress,
              commitment: "finalized",
            }),
          );
          const block = await this.#retry(() =>
            this.#client.getBlock({
              slot: balance.context.slot,
              commitment: "finalized",
            }),
          );
          if (block.blockTime === null) throw new Error("missing block time");
          observations.push({
            trackedWalletId: query.trackedWalletId,
            assetId: query.assetId,
            provider: "solana-rpc",
            blockNumber: balance.context.slot.toString(),
            blockHash: block.blockhash,
            observedAt: new Date(block.blockTime * 1_000).toISOString(),
            fetchedAt: this.#now().toISOString(),
            rawBalance: balance.value.toString(),
            decimals: 9,
            normalizedBalance: formatUnits(balance.value, 9),
            rawPayload: { balanceQueryType: "native", commitment: "finalized" },
          });
        } catch {
          rejections.push({
            trackedWalletId: query.trackedWalletId,
            assetId: query.assetId,
            code: "provider_failure",
            message: "Solana RPC request failed",
          });
        }
      }),
    );

    const providerFailure = rejections.some(
      ({ code }) => code === "provider_failure",
    );
    const failed =
      prepared.length > 0 && observations.length === 0 && providerFailure;
    return {
      observations,
      rejections,
      health: {
        provider: "solana-rpc",
        status: failed
          ? "failed"
          : rejections.length > 0
            ? "degraded"
            : "healthy",
        checkedAt,
        responseTimeMs: Date.now() - startedAt,
        ...(providerFailure
          ? {
              errorCode: "provider_failure",
              errorMessage: "One or more Solana RPC reads failed",
            }
          : {}),
        metadata: {
          requested: queries.length,
          accepted: observations.length,
          rejected: rejections.length,
          preservedPriorBalances: providerFailure,
        },
      },
    };
  }

  async #retry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      if (attempt > 0) await this.#sleep(250 * 2 ** (attempt - 1));
      try {
        return await operation();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
