import type { Metadata } from "next";

import { ProviderStatus } from "../../components/provider-status";
import { SiteNav } from "../../components/site-nav";

export const metadata: Metadata = {
  alternates: { canonical: "/status/" },
  description:
    "Current data-provider monitoring state for the Crypto Founders Value Created Index.",
  title: "System status",
};

export default function StatusPage() {
  return (
    <>
      <SiteNav />
      <main className="content-page" id="main-content" tabIndex={-1}>
        <header className="page-header">
          <p className="eyebrow">Operational transparency</p>
          <h1>System status</h1>
          <p>
            Latest health checks for market and wallet data providers. Raw
            diagnostic messages are restricted to operators.
          </p>
        </header>
        <ProviderStatus />
      </main>
    </>
  );
}
