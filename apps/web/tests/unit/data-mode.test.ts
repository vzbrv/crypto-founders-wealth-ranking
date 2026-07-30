import { describe, expect, it } from "vitest";

import { shouldUseSyntheticFixtures } from "../../lib/data-mode";

describe("static data selection", () => {
  it("uses reviewed production data by default and in production", () => {
    expect(shouldUseSyntheticFixtures({})).toBe(false);
    expect(
      shouldUseSyntheticFixtures({
        NODE_ENV: "production",
        CRYPTO_FOUNDERS_LOCAL_FIXTURES: "1",
      }),
    ).toBe(false);
  });

  it("allows synthetic fixtures only for tests or explicit local development", () => {
    expect(shouldUseSyntheticFixtures({ NODE_ENV: "test" })).toBe(true);
    expect(
      shouldUseSyntheticFixtures({ CRYPTO_FOUNDERS_TEST_FIXTURES: "1" }),
    ).toBe(true);
    expect(
      shouldUseSyntheticFixtures({
        NODE_ENV: "development",
        CRYPTO_FOUNDERS_LOCAL_FIXTURES: "1",
      }),
    ).toBe(true);
  });
});
