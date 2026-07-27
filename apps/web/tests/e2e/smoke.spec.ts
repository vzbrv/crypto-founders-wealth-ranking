import { expect, test } from "@playwright/test";

test("shows the Phase 0 landing page", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Crypto Founders Wealth Ranking" }),
  ).toBeVisible();
  await expect(page.getByText("Repository foundation only")).toBeVisible();
});
