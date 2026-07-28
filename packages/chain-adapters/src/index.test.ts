import { describe, expect, it, vi } from "vitest";

import {
  EvmBalanceAdapter,
  SolanaBalanceAdapter,
  SolanaJsonRpcClient,
  type EvmBalanceQuery,
  type EvmReadClient,
  type SolanaBalanceQuery,
  type SolanaReadClient,
} from "./index.js";

const block = {
  number: 24_000_000n,
  hash: `0x${"a".repeat(64)}` as const,
  timestamp: 1_785_235_200n,
};
const wallet = `0x${"2".repeat(40)}`;
const token = `0x${"1".repeat(40)}`;

function query(overrides: Partial<EvmBalanceQuery> = {}): EvmBalanceQuery {
  return {
    trackedWalletId: "55555555-5555-4555-8555-555555555555",
    assetId: "33333333-3333-4333-8333-333333333333",
    chainCode: "ethereum",
    walletAddress: wallet,
    balanceQueryType: "erc20",
    tokenAddress: token,
    configuredDecimals: 6,
    ...overrides,
  };
}

function client(overrides: Partial<EvmReadClient> = {}): EvmReadClient {
  return {
    getBlock: vi.fn().mockResolvedValue(block),
    getBalance: vi.fn().mockResolvedValue(2_500_000_000_000_000_000n),
    multicall: vi.fn().mockResolvedValue([
      { status: "success", result: 123_456_789n },
      { status: "success", result: 6 },
    ]),
    ...overrides,
  };
}

describe("EvmBalanceAdapter", () => {
  it("batches ERC-20 balance and decimals calls and preserves raw units", async () => {
    const readClient = client();
    const result = await new EvmBalanceAdapter({ client: readClient }).sync([
      query(),
    ]);

    expect(readClient.multicall).toHaveBeenCalledOnce();
    expect(readClient.multicall).toHaveBeenCalledWith(
      expect.objectContaining({
        allowFailure: true,
        blockNumber: block.number,
        contracts: expect.arrayContaining([
          expect.objectContaining({ functionName: "balanceOf" }),
          expect.objectContaining({ functionName: "decimals" }),
        ]),
      }),
    );
    expect(result.observations[0]).toMatchObject({
      rawBalance: "123456789",
      decimals: 6,
      normalizedBalance: "123.456789",
      blockNumber: "24000000",
      blockHash: block.hash,
    });
    expect(result.health.status).toBe("healthy");
  });

  it("reads native ETH at the same recorded block", async () => {
    const readClient = client();
    const result = await new EvmBalanceAdapter({ client: readClient }).sync([
      query({
        balanceQueryType: "native",
        tokenAddress: null,
        configuredDecimals: 18,
      }),
    ]);

    expect(readClient.getBalance).toHaveBeenCalledWith({
      address: wallet,
      blockNumber: block.number,
    });
    expect(result.observations[0]?.normalizedBalance).toBe("2.5");
  });

  it.each([
    [query({ walletAddress: "invalid" }), "invalid_address"],
    [query({ chainCode: "polygon" }), "unsupported_chain"],
  ])(
    "rejects invalid mappings without calling the provider",
    async (item, code) => {
      const readClient = client();
      const result = await new EvmBalanceAdapter({ client: readClient }).sync([
        item,
      ]);

      expect(result.rejections[0]?.code).toBe(code);
      expect(readClient.getBlock).not.toHaveBeenCalled();
      expect(result.observations).toEqual([]);
    },
  );

  it("rejects an on-chain decimals mismatch", async () => {
    const result = await new EvmBalanceAdapter({ client: client() }).sync([
      query({ configuredDecimals: 18 }),
    ]);

    expect(result.observations).toEqual([]);
    expect(result.rejections[0]?.code).toBe("decimals_mismatch");
  });

  it("retries failures and never writes a zero balance fallback", async () => {
    const getBlock = vi.fn().mockRejectedValue(new Error("secret RPC URL"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await new EvmBalanceAdapter({
      client: client({ getBlock }),
      sleep,
      maxRetries: 2,
    }).sync([query()]);

    expect(getBlock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(result.observations).toEqual([]);
    expect(result.health).toMatchObject({
      status: "failed",
      errorMessage: "One or more Ethereum RPC reads failed",
    });
    expect(JSON.stringify(result)).not.toContain("secret RPC URL");
  });

  it("keeps successful multicall observations when another token read fails", async () => {
    const readClient = client({
      multicall: vi
        .fn()
        .mockResolvedValue([
          { status: "success", result: 123_456_789n },
          { status: "success", result: 6 },
          { status: "failure" },
          { status: "success", result: 18 },
        ]),
    });
    const result = await new EvmBalanceAdapter({ client: readClient }).sync([
      query(),
      query({
        trackedWalletId: "65555555-5555-4555-8555-555555555555",
        assetId: "63333333-3333-4333-8333-333333333333",
        tokenAddress: `0x${"3".repeat(40)}`,
        configuredDecimals: 18,
      }),
    ]);

    expect(result.observations).toHaveLength(1);
    expect(result.rejections).toHaveLength(1);
    expect(result.health.status).toBe("degraded");
  });
});

const solanaWallet = "11111111111111111111111111111111";
const solanaBlockhash = "5".repeat(44);

function solanaQuery(
  overrides: Partial<SolanaBalanceQuery> = {},
): SolanaBalanceQuery {
  return {
    trackedWalletId: "85555555-5555-4555-8555-555555555555",
    assetId: "83333333-3333-4333-8333-333333333333",
    chainCode: "solana",
    walletAddress: solanaWallet,
    balanceQueryType: "native",
    configuredDecimals: 9,
    ...overrides,
  };
}

function solanaClient(
  overrides: Partial<SolanaReadClient> = {},
): SolanaReadClient {
  return {
    getBalance: vi.fn().mockResolvedValue({
      context: { slot: 333_000_000 },
      value: 10_500_000_000n,
    }),
    getBlock: vi.fn().mockResolvedValue({
      blockhash: solanaBlockhash,
      blockTime: 1_785_235_200,
    }),
    ...overrides,
  };
}

describe("SolanaBalanceAdapter", () => {
  it("stores native SOL balance with the finalized slot and blockhash", async () => {
    const readClient = solanaClient();
    const result = await new SolanaBalanceAdapter({ client: readClient }).sync([
      solanaQuery(),
    ]);

    expect(readClient.getBlock).toHaveBeenCalledWith({
      slot: 333_000_000,
      commitment: "finalized",
    });
    expect(result.observations[0]).toMatchObject({
      provider: "solana-rpc",
      rawBalance: "10500000000",
      decimals: 9,
      normalizedBalance: "10.5",
      blockNumber: "333000000",
      blockHash: solanaBlockhash,
    });
    expect(result.health.status).toBe("healthy");
  });

  it("preserves an exact u64 balance from a JSON-RPC number", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":333000000},"value":18446744073709551615}}',
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { blockhash: solanaBlockhash, blockTime: 1_785_235_200 },
          }),
        ),
      );
    const client = new SolanaJsonRpcClient(
      "https://rpc.example.invalid",
      fetchImplementation,
    );
    const result = await new SolanaBalanceAdapter({ client }).sync([
      solanaQuery(),
    ]);

    expect(result.observations[0]?.rawBalance).toBe("18446744073709551615");
  });

  it.each([
    [solanaQuery({ walletAddress: "invalid" }), "invalid_address"],
    [solanaQuery({ chainCode: "ethereum" }), "unsupported_chain"],
    [solanaQuery({ configuredDecimals: 8 }), "decimals_mismatch"],
  ])("rejects invalid Solana mappings", async (item, code) => {
    const readClient = solanaClient();
    const result = await new SolanaBalanceAdapter({ client: readClient }).sync([
      item,
    ]);

    expect(result.rejections[0]?.code).toBe(code);
    expect(readClient.getBalance).not.toHaveBeenCalled();
  });

  it("retries provider failures without writing a zero fallback", async () => {
    const getBalance = vi.fn().mockRejectedValue(new Error("secret RPC URL"));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await new SolanaBalanceAdapter({
      client: solanaClient({ getBalance }),
      sleep,
      maxRetries: 2,
    }).sync([solanaQuery()]);

    expect(getBalance).toHaveBeenCalledTimes(3);
    expect(result.observations).toEqual([]);
    expect(result.health).toMatchObject({
      status: "failed",
      errorMessage: "One or more Solana RPC reads failed",
      metadata: { preservedPriorBalances: true },
    });
    expect(JSON.stringify(result)).not.toContain("secret RPC URL");
  });
});
