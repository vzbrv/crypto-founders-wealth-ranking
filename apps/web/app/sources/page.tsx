import type { Metadata } from "next";
import { Suspense } from "react";

import { SiteNav } from "../../components/site-nav";
import { SourceRegistry } from "../../components/source-registry";
import { getAllSourceClaims } from "../../lib/transparency";

export const metadata: Metadata = {
  title: "Source registry",
  description: "Claim-level sources behind the Crypto Founders Wealth Ranking.",
};

export default function SourcesPage() {
  return (
    <>
      <SiteNav />
      <main className="content-page">
        <header className="page-header">
          <p className="eyebrow">Public evidence register</p>
          <h1>Sources</h1>
          <p>
            Every manually curated input used by the calculation links to a
            public source. API observations are labelled separately on project
            pages.
          </p>
        </header>
        <Suspense fallback={<p>Loading source registry…</p>}>
          <SourceRegistry claims={getAllSourceClaims()} />
        </Suspense>
      </main>
    </>
  );
}
