import type { Metadata } from "next";

import { RankingDashboard } from "../components/ranking-dashboard";
import { getResearchSnapshot } from "../lib/research-data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  return <RankingDashboard researchSnapshot={await getResearchSnapshot()} />;
}
