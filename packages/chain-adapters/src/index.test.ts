import { describe, expect, it, vi } from "vitest";

import {
  EvmBalanceAdapter,
  type EvmBalanceQuery,
  type EvmReadClient,
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
