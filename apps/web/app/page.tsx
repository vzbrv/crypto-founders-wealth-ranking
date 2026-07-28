import type { Metadata } from "next";

import { RankingDashboard } from "../components/ranking-dashboard";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return <RankingDashboard />;
}
