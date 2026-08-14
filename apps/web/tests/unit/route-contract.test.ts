import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getUnifiedCalculation,
  getUnifiedDataset,
  getUnifiedProjectIds,
  getUnifiedRanking,
} from "../../lib/production-data";
import { getProvisionalProjectIds } from "../../lib/research-data";

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
  it("redirects removed research routes to sources and removes public links", () => {
    for (const path of ["/research", "/research/", "/research/dogecoin/"]) {
      const redirect = redirectFor(path);
      expect(redirect).toMatchObject({ target: "/sources/", status: 301 });
      expect(redirectFor(redirect?.target ?? "")).toBeNull();
    }

    expect(
      existsSync(resolve(webRoot, "app/research/[[...projectId]]/page.tsx")),
    ).toBe(false);
    expect(readAppFile("app/sitemap.ts")).not.toMatch(
      /["'`]\/research(?:["'`]|\/)/,
    );
    expect(readAppFile("app/sitemap.ts")).not.toContain(
      "getResearchProjectIds",
    );
    expect(readAppFile("components/site-nav.tsx")).not.toMatch(
      /["'`]\/research(?:["'`]|\/)/,
    );
  });

  it("keeps the homepage as the only primary leaderboard", () => {
    const homepage = readAppFile("app/page.tsx");
    const rankingPage = readAppFile("components/unified-ranking-page.tsx");
    const siteNav = readAppFile("components/site-nav.tsx");
    const styles = readAppFile("app/globals.css");

    expect(homepage).toContain("<UnifiedRankingPage />");
    expect(rankingPage).toContain("<HourlyRankingTable");
    expect(siteNav).not.toContain("/brand/iq-logo-pink.svg");
    expect(siteNav).toContain("/#ranking");
    expect(siteNav).toContain('aria-controls="nav-links"');
    expect(siteNav).toContain('id="nav-links"');
    expect(siteNav).not.toContain("/brand/iq-logo-white.svg");
    expect(siteNav).toContain("/brand/iqwiki-black-b.svg");
    expect(siteNav).toContain("/brand/iqwiki-white-w.svg");
    expect(siteNav).not.toContain("/provisional");
    expect(siteNav).not.toContain("/research");
    expect(rankingPage).not.toContain("/provisional/");
    expect(styles).toContain("--brand-pink: #ff5caa");
    expect(styles).toContain("--brand-pink-dark: #ff1a88");
    expect(styles).toContain("--navy: #0f172a");
    expect(styles).toContain("--muted-bg: #f3f4f6");
    expect(styles).toContain("--background: #17202b");
    expect(styles).toContain("--surface-raised: #272d38");
    expect(styles).toContain("--text: #fafcf8");
    expect(styles).toContain("background: rgba(255, 92, 170, 0.05);");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(readAppFile("app/manifest.ts")).toContain('short_name: "IQ.wiki"');
    expect(readAppFile("app/layout.tsx")).toContain(
      "IQ.wiki Value Created Index — Value Created for Others",
    );
    expect(readAppFile("app/opengraph-image.tsx")).toContain(
      "IQ.wiki Value Created Index — Value Created for Others",
    );
    expect(homepage).toContain(
      "IQ.wiki Value Created Index — Value Created for Others",
    );
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
