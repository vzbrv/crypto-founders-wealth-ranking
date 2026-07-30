import { expect, test, type Page } from "@playwright/test";

const now = new Date().toISOString();

async function mockPublicData(page: Page) {
  await page.route("**/rest/v1/public_leaderboard**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          rank: 1,
          previous_rank: 2,
          rank_change: 1,
          score_usd: "800000000",
          confidence_label: "high",
          calculated_at: now,
          founding_unit_id: "unit-alpha",
          slug: "alice-founder",
          display_name: "Alice Founder",
          description: null,
          image_url: null,
          iq_wiki_slug: null,
          project_breakdown: [
            { projectId: "project-alpha", attributionFraction: 1 },
          ],
          warnings: [],
          eligibility_status: "ranked",
          ineligibility_reasons: [],
          research_status: "Ranked",
        },
        {
          rank: null,
          previous_rank: null,
          rank_change: null,
          score_usd: null,
          confidence_label: "insufficient",
          calculated_at: now,
          founding_unit_id: "unit-beta",
          slug: "beta-team",
          display_name: "Beta Team",
          description: null,
          image_url: null,
          iq_wiki_slug: null,
          project_breakdown: [
            { projectId: "project-beta", attributionFraction: 1 },
          ],
          warnings: ["Circulating supply requires review."],
          eligibility_status: "research_in_progress",
          ineligibility_reasons: ["Circulating supply requires review."],
          research_status: "Research in progress",
        },
      ]),
    }),
  );
  await page.route("**/rest/v1/public_project_details**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "project-alpha",
          slug: "alpha",
          name: "Alpha Protocol",
          symbol: "ALPHA",
          market_cap_usd: "1000000000",
          outside_holder_value_usd: "850000000",
          capital_raised_usd: "50000000",
          data_freshness: { marketObservedAt: now },
          calculated_at: now,
        },
        {
          id: "project-beta",
          slug: "beta",
          name: "Beta Network",
          symbol: "BETA",
          market_cap_usd: null,
          outside_holder_value_usd: null,
          capital_raised_usd: null,
          data_freshness: {},
          calculated_at: now,
        },
      ]),
    }),
  );
}

test("loads, filters, and separates research entries", async ({ page }) => {
  await mockPublicData(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Crypto founders, ranked by value created.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Alice Founder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beta Team" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search" }).fill("Beta");
  await expect(page.getByRole("cell", { name: "Alice Founder" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: "Beta Team" })).toBeVisible();

  await page.getByRole("combobox", { name: "Confidence" }).selectOption("high");
  await expect(
    page.getByText("No research entries match these filters."),
  ).toBeVisible();
});

test("fits the public ranking on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublicData(page);
  await page.goto("/");
  await expect(page.getByRole("cell", { name: "Alice Founder" })).toBeVisible();
  const rankingRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "Alice Founder" }) });
  await expect(rankingRow.getByText("high", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("updates supported live scores and preserves them during reconnect", async ({
  page,
}) => {
  await page.addInitScript(
    ({ observedAt }) => {
      let connectionCount = 0;
      class MockWebSocket {
        static readonly OPEN = 1;
        readyState = 0;
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent<string>) => void) | null = null;
        onclose: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;

        constructor() {
          connectionCount += 1;
          if (connectionCount !== 1) return;
          window.setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            this.onopen?.(new Event("open"));
            window.setTimeout(() => {
              this.onmessage?.(
                new MessageEvent("message", {
                  data: JSON.stringify({
                    channel: "ticker_batch",
                    timestamp: observedAt,
                    events: [
                      {
                        tickers: [{ product_id: "ETH-USD", price: "2.1" }],
                      },
                    ],
                  }),
                }),
              );
              window.setTimeout(() => this.close(), 40);
            }, 10);
          }, 0);
        }

        send() {}

        close() {
          if (this.readyState === 3) return;
          this.readyState = 3;
          this.onclose?.(new Event("close"));
        }
      }

      Object.defineProperty(window, "WebSocket", {
        configurable: true,
        value: MockWebSocket,
      });
    },
    { observedAt: now },
  );
  await page.route("**/rest/v1/public_leaderboard**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          rank: 1,
          previous_rank: 1,
          rank_change: 0,
          score_usd: "800000000",
          confidence_label: "high",
          calculated_at: now,
          founding_unit_id: "unit-ethereum",
          slug: "ethereum-founders",
          display_name: "Ethereum Founders",
          project_breakdown: [
            { projectId: "project-ethereum", attributionFraction: 1 },
          ],
          warnings: [],
          eligibility_status: "ranked",
          ineligibility_reasons: [],
          research_status: "Ranked",
        },
      ]),
    }),
  );
  await page.route("**/rest/v1/public_project_details**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "project-ethereum",
          slug: "ethereum",
          name: "Ethereum",
          symbol: "ETH",
          score_usd: "800000000",
          price_usd: "2",
          circulating_supply: "500000000",
          excluded_supply: "75000000",
          outside_holder_supply: "425000000",
          capital_raised_usd: "50000000",
          data_freshness: { marketObservedAt: now },
          calculated_at: now,
        },
      ]),
    }),
  );

  await page.goto("/");

  await expect(page.getByText("$842.5M", { exact: true })).toBeVisible();
  await expect(page.getByText("Live estimate", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Canonical $800M", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Reconnecting", { exact: true })).toBeVisible();
  await expect(page.getByText("$842.5M", { exact: true })).toBeVisible();
});

test("shows a reproducible project score and its evidence", async ({
  page,
}) => {
  await page.route("**/rest/v1/public_project_details**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "synthetic-horizon",
          market_cap_usd: "1000000000",
          price_usd: "2",
          circulating_supply: "500000000",
          excluded_supply: "75000000",
          excluded_value_usd: "150000000",
          outside_holder_supply: "425000000",
          capital_raised_usd: "50000000",
          calculated_at: now,
        },
      ]),
    }),
  );
  await page.route("**/rest/v1/public_wallet_evidence**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          wallet_id: "55555555-5555-4555-8555-555555555555",
          balance: "100000000",
          balance_observed_at: now,
          balance_provider: "mock provider",
          deductible_balance: "75000000",
          deductible_value_usd: "150000000",
        },
      ]),
    }),
  );
  await page.route("**/rest/v1/public_leaderboard**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          rank: 1,
          score_usd: "800000000",
          confidence_label: "high",
          project_breakdown: [
            {
              projectId: "11111111-1111-4111-8111-111111111111",
              attributionFraction: 1,
            },
          ],
          eligibility_status: "ranked",
          ineligibility_reasons: [],
          research_status: "Ranked",
        },
      ]),
    }),
  );

  await page.goto("/project/synthetic-horizon/");

  await expect(
    page.getByRole("heading", { name: "Synthetic Horizon Protocol" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Score breakdown" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Wallet deductions" }),
  ).toBeVisible();
  await expect(page.getByTestId("score-equation")).toHaveText(
    "max(0, $1,000,000,000.00 − $150,000,000.00 − $50,000,000.00) = $800,000,000.00",
  );
  await expect(page.getByText("mock provider", { exact: false })).toBeVisible();
});

test("filters the claim-level source registry", async ({ page }) => {
  await page.goto("/sources/?project=synthetic-horizon");

  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(
    page.getByText("Showing 20 of 20 claim-source links."),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Claim" })
    .selectOption("classification");
  await expect(
    page.getByText("Showing 1 of 20 claim-source links."),
  ).toBeVisible();
});

test("documents the public methodology", async ({ page }) => {
  await page.goto("/methodology/");

  await expect(
    page.getByRole("heading", { name: "Methodology" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Circulation assumptions" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Confidence system" }),
  ).toBeVisible();
});

test("shows sanitized provider monitoring state", async ({ page }) => {
  await page.route("**/rest/v1/public_provider_status**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          provider: "coinbase-market-data",
          checked_at: now,
          status: "healthy",
          latency_ms: 120,
          freshness: "current",
        },
      ]),
    }),
  );
  await page.goto("/status/");

  await expect(
    page.getByRole("heading", { name: "System status" }),
  ).toBeVisible();
  await expect(page.getByText("Operational", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: "Coinbase Market Data" }),
  ).toBeVisible();
});

test("supports keyboard navigation to main content", async ({ page }) => {
  await page.goto("/methodology/");
  const skipLink = page.getByRole("link", { name: "Skip to content" });

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
