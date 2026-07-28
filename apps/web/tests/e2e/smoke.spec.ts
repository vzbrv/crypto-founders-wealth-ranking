import { expect, test, type Page } from "@playwright/test";

const now = new Date().toISOString();

async function mockPublicData(page: Page) {
  await page.route("**/rest/v1/current_leaderboard**", (route) =>
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

  await page.getByLabel("Search").fill("Beta");
  await expect(page.getByRole("cell", { name: "Alice Founder" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: "Beta Team" })).toBeVisible();

  await page.getByLabel("Confidence").selectOption("high");
  await expect(
    page.getByText("No research entries match these filters."),
  ).toBeVisible();
});

test("fits the public ranking on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublicData(page);
  await page.goto("/");
  await expect(page.getByRole("cell", { name: "Alice Founder" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Confidence" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
