import type { Metadata } from "next";

import UnifiedRankingPage from "../components/unified-ranking-page";

export const metadata: Metadata = {
  title: {
    absolute: "Top Crypto Founders Ranked by Value Created for Others.",
  },
  description:
    "A transparent provisional ranking of crypto founders and joint founding teams by project circulating market value minus verified affiliated holdings and reviewed outside capital.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <UnifiedRankingPage />;
}
