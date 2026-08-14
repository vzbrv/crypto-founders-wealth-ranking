import type { Metadata } from "next";

import UnifiedRankingPage from "../components/unified-ranking-page";

export const metadata: Metadata = {
  title: {
    absolute: "IQ.wiki Estimated Value Created Ranking — Crypto Founders",
  },
  description:
    "A transparent, time-stamped ranking of crypto founders and founding teams by estimated value created for outside holders and shareholders—not personal wealth.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <UnifiedRankingPage />;
}
