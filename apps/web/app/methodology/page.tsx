import type { Metadata } from "next";

import { SiteFooter, SiteNav } from "../../components/site-nav";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How the unified Crypto Founders Value Created Index is calculated and sourced.",
  alternates: { canonical: "/methodology/" },
};

const sections = [
  [
    "Purpose and metric",
    "The primary metric is Provisional value created for outside holders and shareholders. It ranks founders and joint founding teams associated with liquid token networks and public crypto companies. It is not founder net worth, personal wealth, founder-retained value, a claim that one person created all entity value, or investment advice.",
  ],
  [
    "Token/network formula",
    "Circulating token market value − verified affiliated holdings included in circulating supply − reviewed outside capital = value created for outside holders. Unknown deductions remain Unknown and do not reduce the score. Locked or non-circulating tokens cannot be deducted. Incomplete deductions are upper estimates.",
  ],
  [
    "Public-company formula",
    "Reconstructed public market capitalization − disclosed founder/affiliate equity value − reviewed pre-listing outside capital = value created for outside shareholders. Market capitalization uses the dated closing price and authoritative outstanding shares by class; enterprise value and fully diluted shares are excluded unless explicitly required by the stored method.",
  ],
  [
    "Founders and affiliated ownership",
    "The ranking uses one joint founding unit per economic entity. Founder, trust, controlled-company, and other affiliate shares are counted once, with holder-level evidence. Share classes are summed without double counting. Stablecoin supply is never substituted for company equity value, and token/network value is not combined with the same company's equity value.",
  ],
  [
    "Outside capital",
    "Only documented, reviewed capital events are accepted. Pre-listing financing is deducted for public companies; post-listing financing, repurchases, secondary transactions, stock compensation, and convertibles are included or excluded exactly as stated on each calculation page. Disputed, excluded, and scenario-only amounts cannot affect the primary ranking. Reviewed $0 requires affirmative evidence.",
  ],
  [
    "Snapshot alignment",
    "The ranking snapshot is July 30, 2026. Price, market-value, share-count, ownership, and capital observations retain their own dates. Pages disclose date differences and staleness so an apparently precise result is not mistaken for a same-day reconstruction.",
  ],
  [
    "Confidence scoring",
    "Scores are reproducible from stored components for founder attribution, gross market-value reconstruction, founder/affiliate ownership completeness, outside-capital completeness, source quality, snapshot alignment, and double-counting risk. Strong market data cannot produce a high-confidence label when ownership or capital evidence is materially incomplete.",
  ],
  [
    "Eligibility and upper estimates",
    "Only supported, validated entries can rank. Unknown values never become zero. An entry with an unknown accepted deduction may remain eligible but is labelled an upper estimate. Canonical publication and provisional eligibility remain distinct; validation failures remove an entry from the primary table.",
  ],
  [
    "Private-company exclusions",
    "Unverifiable private-company valuations are not ranked. Binance, Kraken, and Tether are shown separately as candidates with non-ranking valuation references and the missing evidence that prevents inclusion.",
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
          <p className="eyebrow">Unified v1 · Updated August 1, 2026</p>
          <h1>Methodology</h1>
          <p>
            One transparent framework for comparing liquid value created for
            outside token holders and public-company shareholders.
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
            Every accepted numerical input has a source record. Calculations,
            included evidence, excluded evidence, disputed evidence, and
            remaining unknowns are visible on each detail page.
          </p>
          <a href="/sources/">Browse the source registry</a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
