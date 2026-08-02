import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getProvisionalProjectIds,
  getUnifiedCalculation,
  getUnifiedDataset,
  getUnifiedProjectIds,
  getUnifiedRanking,
} from "../../lib/research-data";

const webRoot = resolve(process.cwd());
const readAppFile = (relativePath: string) =>
  readFileSync(resolve(webRoot, relativePath), "utf8");

const redirectRules = readAppFile("public/_redirects")
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .filter(
    (parts): parts is [string, string, string] =>
      parts.length >= 3 && parts.every(Boolean),
  )
  .map(([source, target, status]) => ({
    source,
    target,
    status: Number(status),
  }));

function redirectFor(pathname: string) {
  for (const rule of redirectRules) {
    if (rule.source === pathname) return rule;
    if (
      rule.source.endsWith("/*") &&
      pathname.startsWith(rule.source.slice(0, -1))
    ) {
      return {
        ...rule,
        target: rule.target.replace(
          ":splat",
          pathname.slice(rule.source.length - 1),
        ),
      };
    }
  }
  return null;
}

describe("ranking route contract", () => {
  it("keeps the homepage as the only primary leaderboard", () => {
    const homepage = readAppFile("app/page.tsx");
    const rankingPage = readAppFile("components/unified-ranking-page.tsx");
    const siteNav = readAppFile("components/site-nav.tsx");

    expect(homepage).toContain("<UnifiedRankingPage />");
    expect(rankingPage).toContain("<table");
    expect(siteNav).not.toContain("/provisional");
    expect(rankingPage).not.toContain("/provisional/");
  });

  it("has a new statically generated detail route for every ranked entry", async () => {
    const ids = await getUnifiedProjectIds();
    const detailPage = readAppFile("app/ranking/[entryId]/page.tsx");

    expect(ids).toHaveLength(20);
    expect(ids).toContain("coinbase");
    expect(detailPage).toContain("generateStaticParams");
    for (const entryId of ids) {
      await expect(getUnifiedCalculation(entryId)).resolves.toBeTruthy();
    }
  });

  it("permanently redirects every legacy route without a loop", async () => {
    expect(redirectFor("/provisional")).toMatchObject({
      target: "/",
      status: 301,
    });
    expect(redirectFor("/provisional/")).toMatchObject({
      target: "/",
      status: 301,
    });

    for (const entryId of await getProvisionalProjectIds()) {
      const legacyPath = `/provisional/${entryId}/`;
      const redirect = redirectFor(legacyPath);
      expect(redirect).toMatchObject({
        target: `/ranking/${entryId}/`,
        status: 301,
      });
      expect(redirectFor(redirect?.target ?? "")).toBeNull();
    }
  });

  it("indexes only new detail URLs and leaves robots open", async () => {
    const sitemap = readAppFile("app/sitemap.ts");
    const robots = readAppFile("app/robots.ts");
    const detailPage = readAppFile("app/ranking/[entryId]/page.tsx");

    expect(sitemap).not.toContain("/provisional");
    expect(sitemap).toContain("/ranking/${entryId}/");
    expect(detailPage).toContain("canonical: `/ranking/${entryId}/`");
    expect(robots).toContain('allow: "/"');
    expect(robots).toContain("sitemap.xml");
    for (const entryId of await getUnifiedProjectIds()) {
      expect(await getUnifiedCalculation(entryId)).toBeTruthy();
    }
  });

  it("preserves the unified ranking shape and calculation tracks", async () => {
    const dataset = await getUnifiedDataset();
    const ranking = await getUnifiedRanking();
    const rankedIds = ranking.map(({ entry }) => entry.entryId);
    const publicCompanies = ranking.filter(
      ({ entry }) => entry.valueType === "Public company",
    );
    const tokenNetworks = ranking.filter(
      ({ entry }) => entry.valueType === "Token/network",
    );

    expect(dataset.entries).toHaveLength(20);
    expect(ranking).toHaveLength(20);
    expect(rankedIds).toEqual(dataset.entries.map(({ entryId }) => entryId));
    expect(ranking.map(({ entry }) => entry.rank)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(publicCompanies.map(({ entry }) => entry.entryId)).toEqual(
      expect.arrayContaining([
        "coinbase",
        "circle",
        "figure",
        "galaxy-digital",
      ]),
    );
    expect(tokenNetworks.length).toBeGreaterThan(0);
    for (const { entry } of ranking) {
      expect(entry.confidence).toBeTruthy();
      expect(entry.includedEvidence.length).toBeGreaterThan(0);
      expect(entry.excludedEvidence.length).toBeGreaterThanOrEqual(0);
      expect(entry.disputedEvidence.length).toBeGreaterThanOrEqual(0);
      expect(entry.affiliatedOwnership).toBeTruthy();
      expect(entry.outsideCapital).toBeTruthy();
    }
  });
});
