import { expect, test, type Page } from "@playwright/test";

const now = new Date().toISOString();

// Builds a complete, internally-valid 20-entry live snapshot payload matching
// what HourlyRankingTable (apps/web/components/hourly-ranking-table.tsx)
// requires before it will render the live view instead of falling back to
// the bundled snapshot: exactly 20 entries, unique entry ids, contiguous
// ranks 1..20, and every entry has a non-null final_value_usd.
function buildLiveSnapshotResults(
  overrides: Partial<Record<number, Record<string, unknown>>> = {},
): Record<string, unknown>[] {
  return Array.from({ length: 20 }, (_, index) => {
    const rank = index + 1;
    return {
      snapshot_id: "snapshot-current",
      utc_hour: now,
      publication_at: now,
      entry_id: `entry-${rank}`,
      rank,
      value_type: "Token/network",
      gross_value_usd: "1000000000.00",
      final_value_usd: "800000000.00",
      confidence_score: 90,
      confidence_label: "high",
      source_ids: [`market:entry-${rank}`],
      observation_at: now,
      freshness_status: "current",
      previous_rank: rank,
      rank_change: 0,
      rank_change_status: "unchanged",
      founder_team: `Founder ${rank}`,
      project: `Project ${rank}`,
      market: { type: "token", coinGeckoCoinId: `token-${rank}` },
      upper_estimate: false,
      ...overrides[rank],
    };
  });
}

function buildV2SnapshotResults(): Record<string, unknown>[] {
  return [
    {
      snapshot_id: "snapshot-v2",
      economic_as_of: now,
      knowledge_cutoff: now,
      published_at: now,
      economic_project_id: "project-ethereum",
      project_slug: "ethereum",
      project_name: "Ethereum",
      founder_team: "Vitalik Buterin (founder); Ethereum founding team",
      value_created_lower: "70000000.00000000",
      value_created_upper: "90000000.00000000",
      eligibility_status: "provisional",
      rank_min: 1,
      rank_max: 2,
      rank_order_status: "overlapping",
      confidence_status: "medium",
      is_invalidated: false,
      invalidation_message: null,
      methodology_version_id: "v2",
      confidence_policy_version: "v1",
    },
    {
      snapshot_id: "snapshot-v2",
      economic_as_of: now,
      knowledge_cutoff: now,
      published_at: now,
      economic_project_id: "project-solana",
      project_slug: "solana",
      project_name: "Solana",
      founder_team: "Anatoly Yakovenko (founder); Solana founding team",
      value_created_lower: "60000000.00000000",
      value_created_upper: "60000000.00000000",
      eligibility_status: "eligible",
      rank_min: 2,
      rank_max: 2,
      rank_order_status: "exact",
      confidence_status: "high",
      is_invalidated: false,
      invalidation_message: null,
      methodology_version_id: "v2",
      confidence_policy_version: "v1",
    },
  ];
}

async function mockLiveSnapshot(
  page: Page,
  {
    results,
    latestStatus,
  }: {
    results: Record<string, unknown>[];
    latestStatus?: Record<string, unknown>;
  },
) {
  await page.route("**/rest/v1/rpc/get_current_ranking_v2", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.route("**/rest/v1/public_latest_snapshot_status**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          status: "published",
          publication_at: now,
          observation_at: now,
          failure_reason: null,
          ...latestStatus,
        },
      ]),
    }),
  );
  await page.route("**/rest/v1/public_current_published_snapshot**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          utc_hour: now,
          observation_at: now,
          publication_at: now,
          is_immutable: true,
        },
      ]),
    }),
  );
  await page.route("**/rest/v1/public_current_snapshot_results**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(results),
    }),
  );
}

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

test.skip("retired project-first dashboard filters", async ({ page }) => {
  await mockPublicData(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Crypto founding units, ranked by outside-holder value.",
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

test("fits the founder ranking on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Top Crypto Founders Ranked by Value Created for Others.",
    }),
  ).toBeVisible();
  await expect(page.locator(".research-universe-table thead")).toBeAttached();
  await expect(page.locator("tbody tr td a").first()).toBeVisible();
  await expect(page.locator("tbody tr").first()).toHaveCSS("display", "block");
  await expect(page.locator("tbody tr td").nth(2)).toHaveAttribute(
    "data-label",
    "Founder / founding team",
  );
  expect(
    await page
      .locator(".research-universe-table")
      .evaluate((table) => table.scrollWidth <= table.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test.skip("retired project-first dashboard live score behavior", async ({
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
    page.getByText("Published $800M", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Reconnecting", { exact: true })).toBeVisible();
  await expect(page.getByText("$842.5M", { exact: true })).toBeVisible();
});

test("shows a reproducible project score and its evidence", async ({
  page,
}) => {
  const marketObservationId = "66666666-6666-4666-8666-666666666666";
  const marketSourceUrl =
    "https://api.coingecko.com/api/v3/coins/markets?ids=synthetic-horizon";
  let exposeMarketSource = true;

  await page.route("**/rest/v1/public_project_details**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "synthetic-horizon",
          eligibility_status: "ranked",
          market_cap_usd: "1000000000",
          price_usd: "2",
          circulating_supply: "500000000",
          excluded_supply: "75000000",
          excluded_value_usd: "150000000",
          outside_holder_supply: "425000000",
          capital_raised_usd: "50000000",
          calculated_at: now,
          market_observation_id: marketObservationId,
          market_provider: "coingecko",
          market_source_url: exposeMarketSource ? marketSourceUrl : null,
          market_source_description: exposeMarketSource
            ? "CoinGecko coins markets API observation"
            : null,
          market_observed_at: now,
          market_fetched_at: now,
          market_freshness_status: "current",
          wallet_review_status: "approved_sufficient",
          wallet_review_reviewer: "Synthetic reviewer",
          wallet_review_reviewed_at: now,
          wallet_review_evidence: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              title: "Synthetic Horizon fixture source",
              url: "https://example.com/research/synthetic-horizon",
              publisher: "Example Research",
              sourceType: "official_documentation",
            },
          ],
          funding_review_status: "approved_sufficient",
          funding_review_reviewer: "Synthetic reviewer",
          funding_review_reviewed_at: now,
          funding_review_evidence: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              title: "Synthetic Horizon fixture source",
              url: "https://example.com/research/synthetic-horizon",
              publisher: "Example Research",
              sourceType: "official_documentation",
            },
          ],
        },
      ]),
    }),
  );
  await page.route("**/rest/v1/public_wallet_evidence**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "55555555-5555-4555-8555-555555555555",
          balance: "100000000",
          balance_observed_at: null,
          balance_provider: "mock provider",
          deductible_balance: "75000000",
          deductible_value_usd: "150000000",
          review_status: "approved_sufficient",
          reviewer: "Synthetic reviewer",
          reviewed_at: now,
          review_evidence: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              title: "Synthetic Horizon fixture source",
              url: "https://example.com/research/synthetic-horizon",
              publisher: "Example Research",
              sourceType: "official_documentation",
            },
          ],
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
  await expect(page.getByTestId("score-equation")).toHaveAttribute(
    "data-market-observation-id",
    marketObservationId,
  );
  const marketObservation = page.getByTestId("market-observation");
  await expect(marketObservation).toHaveAttribute(
    "data-market-observation-id",
    marketObservationId,
  );
  await expect(
    marketObservation.getByRole("link", {
      name: "CoinGecko coins markets API observation",
    }),
  ).toHaveAttribute("href", marketSourceUrl);
  await expect(marketObservation).toContainText(
    `Observation ${marketObservationId}`,
  );
  await expect(page.getByText("mock provider", { exact: false })).toBeVisible();
  await expect(page.getByText("Unknown · mock provider")).toBeVisible();
  await expect(
    page
      .locator("#wallets .section-heading")
      .getByRole("link", { name: "Example Research" }),
  ).toHaveAttribute("href", "https://example.com/research/synthetic-horizon");
  const walletEvidenceLinks = page
    .locator("#wallets tbody")
    .getByRole("link", { name: "Example Research" });
  await expect(walletEvidenceLinks).toHaveCount(2);
  for (const link of await walletEvidenceLinks.all()) {
    await expect(link).toHaveAttribute(
      "href",
      "https://example.com/research/synthetic-horizon",
    );
  }
  await expect(
    page
      .locator("#funding .section-heading")
      .getByRole("link", { name: "Example Research" }),
  ).toHaveAttribute("href", "https://example.com/research/synthetic-horizon");

  exposeMarketSource = false;
  await page.reload();
  await expect(page.getByTestId("market-observation")).toContainText(
    "Unknown — missing evidence",
  );
  await expect(
    page
      .getByTestId("market-observation")
      .getByRole("link", { name: "CoinGecko coins markets API observation" }),
  ).toHaveCount(0);
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
    page.getByRole("heading", { name: "Token/network formula" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Public-company formula" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Confidence scoring" }),
  ).toBeVisible();
});

test("redirects removed research routes to sources", async ({ page }) => {
  for (const path of ["/research", "/research/", "/research/dogecoin/"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sources\/$/);
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Founding-unit research universe" }),
    ).toHaveCount(0);
  }
});

test("publishes unified founder calculations and sources separately", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Top Crypto Founders Ranked by Value Created for Others.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", {
      name: "Founder or joint founding team",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Project or company" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Rank change" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Value type" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Value created for others" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Confidence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Gross market value" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Affiliated ownership" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Outside capital" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "Snapshot" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Unknown deductions remain Unknown"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Coverage warning" }),
  ).toBeVisible();
  const rankingTable = page.getByRole("table").first();
  await expect(rankingTable.getByRole("row")).toHaveCount(21);
  await expect(
    rankingTable.getByRole("link", { name: "Calculation & sources" }),
  ).toHaveCount(20);
  await expect(page.getByText("Coinbase", { exact: true })).toHaveCount(1);

  const rankedProjects = await rankingTable
    .locator("tbody tr td:nth-child(4)")
    .allTextContents();
  expect(rankedProjects.indexOf("Chainlink")).toBeLessThan(
    rankedProjects.indexOf("Cardano"),
  );

  await page.goto("/ranking/coinbase/");
  await expect(
    page.getByRole("heading", { name: "Brian Armstrong & Fred Ehrsam" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Public-company reconstruction" }),
  ).toBeVisible();
  await expect(
    page.getByText("Gross market value", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Founder/affiliate shares:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("$43,184,827,557", { exact: false }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Brian Armstrong & Fred Ehrsam" }),
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

test("supports keyboard control of the mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const openButton = page.getByRole("button", {
    name: "Open navigation menu",
  });
  await openButton.focus();
  await openButton.press("Enter");
  await expect(
    page.getByRole("button", { name: "Close navigation menu" }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator("#nav-links").getByRole("link", { name: "Ranking" }),
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(openButton).toBeFocused();
});

// The three tests below exercise the degraded-data states documented in
// docs/architecture.md's transparency promise: a live snapshot that's
// present but stale, a live snapshot present alongside a failed scheduled
// run, and total absence of a valid live snapshot (fallback to the bundled
// production data). None of these were previously covered by e2e tests —
// see the audit notes.

test("renders the atomic v2 ranking and reports a newer failed run", async ({
  page,
}) => {
  await page.route("**/rest/v1/public_latest_snapshot_status**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          status: "failed",
          publication_at: null,
          observation_at: now,
          failure_reason: "CoinGecko quota exhausted",
        },
      ]),
    }),
  );
  await page.route("**/rest/v1/rpc/get_current_ranking_v2", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(buildV2SnapshotResults()),
    }),
  );

  await page.goto("/");

  await expect(
    page.locator("p.notice").filter({ hasText: /^Published v2 snapshot/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Vitalik Buterin (founder); Ethereum founding team"),
  ).toBeVisible();
  await expect(page.getByText("$70M–$90M")).toBeVisible();
  await expect(page.getByText("Rank order: overlapping")).toBeVisible();
  await expect(page.getByText("Provisional interval")).toBeVisible();
  await expect(
    page.getByText(
      "Latest scheduled run failed. Showing the last verified published v2 snapshot: CoinGecko quota exhausted",
      { exact: false },
    ),
  ).toBeVisible();
});

test("shows a stale-data notice when the live snapshot reports stale freshness", async ({
  page,
}) => {
  const results = buildLiveSnapshotResults({
    1: { freshness_status: "stale" },
  });
  await mockLiveSnapshot(page, { results });

  await page.goto("/");

  await expect(
    page.getByText("Live immutable snapshot", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Data freshness: stale.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Observation: stale")).toBeVisible();
});

test("shows a scheduled-run-failed notice while still rendering the last good live snapshot", async ({
  page,
}) => {
  const results = buildLiveSnapshotResults();
  await mockLiveSnapshot(page, {
    results,
    latestStatus: {
      status: "failed",
      failure_reason: "CoinGecko quota exhausted",
    },
  });

  await page.goto("/");

  await expect(
    page.getByText("Data freshness: current.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Latest scheduled run failed. Showing the last complete immutable snapshot: CoinGecko quota exhausted",
      { exact: false },
    ),
  ).toBeVisible();
});

test("falls back to the bundled snapshot when no valid live snapshot is available", async ({
  page,
}) => {
  await page.route("**/rest/v1/rpc/get_current_ranking_v2", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await page.route("**/rest/v1/public_latest_snapshot_status**", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await page.route("**/rest/v1/public_current_published_snapshot**", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );
  await page.route("**/rest/v1/public_current_snapshot_results**", (route) =>
    route.fulfill({ status: 500, body: "" }),
  );

  await page.goto("/");

  await expect(
    page.getByText("No complete immutable live snapshot is available.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Live endpoint refresh failed.", { exact: false }),
  ).toBeVisible();
});

test("rejects a response containing rows from multiple snapshots", async ({
  page,
}) => {
  const results = buildLiveSnapshotResults({
    20: { snapshot_id: "snapshot-other" },
  });
  await mockLiveSnapshot(page, {
    results,
    latestStatus: {
      status: "failed",
      failure_reason: "Published snapshot failed completeness validation",
    },
  });

  await page.goto("/");

  await expect(
    page.getByText("No complete immutable live snapshot is available.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Published snapshot failed completeness validation", {
      exact: false,
    }),
  ).toBeVisible();
});
