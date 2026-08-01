import type { Metadata } from "next";

import { SiteNav } from "../../components/site-nav";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How the Crypto Founders Value Created Index is calculated and sourced.",
  alternates: { canonical: "/methodology/" },
};

const sections = [
  [
    "What the score measures",
    "The estimate attributes liquid value held by outside token holders to a founding unit. It is not personal net worth, realized profit, enterprise value, or social impact.",
  ],
  [
    "Formula",
    "Circulating market value minus approved project-affiliated circulating holdings minus qualifying outside capital equals estimated outside-holder token value. Project scores are allocated to founding units using a sourced attribution fraction.",
  ],
  [
    "Excluded holdings",
    "Only documented project-, treasury-, team-, or founder-affiliated holdings are eligible. A wallet must be approved, mapped to the asset, and have a known circulating-inclusion fraction. Unknown fractions are not deducted and create a warning.",
  ],
  [
    "Outside capital",
    "Publicly documented funding is converted to USD at the event date and deducted only when the record explicitly qualifies. Original amount, currency, conversion method, inclusion decision, and source remain visible.",
  ],
  [
    "Circulation assumptions",
    "Circulating supply follows the published market observation. Wallet balances are multiplied by their curated circulating-inclusion fraction. A fraction of 0 excludes the balance from circulating supply; 1 treats all of it as circulating.",
  ],
  [
    "Founding units",
    "Attribution is stored per project-to-founding-unit link. Team collectives may receive the full project score; individual founders may receive sourced fractional shares. Fractions across active links cannot exceed 100%.",
  ],
  [
    "Stablecoins",
    "Stablecoin issuance is not treated as outside-holder value merely because supply exists. A stablecoin project requires a category-specific methodology and eligible outside-holder value before ranking.",
  ],
  [
    "FDV and TVL",
    "Fully diluted valuation and total value locked are not used in the core score. FDV counts non-circulating supply; TVL often includes user deposits and can double-count capital.",
  ],
  [
    "Confidence system",
    "Confidence is evidence-derived: founder identity is 10 points; founder-wallet coverage, team/foundation/treasury coverage, circulation treatment, and funding completeness are 20 each; market reliability is 10. High is 85–100, medium 65–84, low 40–64, and insufficient below 40. Missing required inputs or blocking validation failures keep an entry unranked rather than substituting zero.",
  ],
  [
    "Update frequency",
    "Market and wallet observations can refresh automatically. Curated ownership, classification, attribution, circulation, and funding inputs change only after research review. Each project shows calculation, observation, and review timestamps.",
  ],
  [
    "Limitations",
    "Public wallet attribution can be incomplete or disputed, exchange and custody balances can obscure ownership, provider data can diverge, and funding disclosures can omit terms. Scores are estimates and should not be used as investment advice.",
  ],
];

export default function MethodologyPage() {
  return (
    <>
      <SiteNav />
      <main
        className="content-page methodology-page"
        id="main-content"
        tabIndex={-1}
      >
        <header className="page-header">
          <p className="eyebrow">Version 1.0 · Updated July 28, 2026</p>
          <h1>Methodology</h1>
          <p>
            A reproducible, conservative framework for estimating liquid value
            created outside project-affiliated holdings.
          </p>
        </header>
        <div className="methodology-grid">
          {sections.map(([title, body], index) => (
            <section className="methodology-card" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{title}</h2>
                <p>{body}</p>
              </div>
            </section>
          ))}
        </div>
        <section className="warning-panel">
          <h2>Research standard</h2>
          <p>
            Every manual input requires a claim-level source. Curated research
            and API observations are visibly separated. Calculation failures
            produce an unavailable result, never a fabricated score.
          </p>
          <a href="/sources/">Browse the source registry</a>
        </section>
      </main>
    </>
  );
}
