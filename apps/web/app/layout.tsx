import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "../lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "IQ.wiki Estimated Value Created Ranking — Crypto Founders",
    template: "%s · IQ.wiki Estimated Value Created Ranking",
  },
  description:
    "A transparent, time-stamped ranking of crypto founders and founding teams by estimated value created for outside holders and shareholders—not personal wealth.",
  applicationName: "IQ.wiki Estimated Value Created Ranking",
  alternates: { canonical: "/" },
  category: "finance",
  openGraph: {
    description:
      "A transparent, time-stamped ranking of crypto founders and founding teams by estimated value created for outside holders and shareholders—not personal wealth.",
    images: [
      {
        alt: "IQ.wiki Estimated Value Created Ranking — Crypto Founders",
        url: "/opengraph-image",
      },
    ],
    siteName: "IQ.wiki Estimated Value Created Ranking",
    title: "IQ.wiki Estimated Value Created Ranking — Crypto Founders",
    type: "website",
    url: "/",
  },
  robots: { follow: true, index: true },
  twitter: {
    card: "summary_large_image",
    description:
      "A transparent, time-stamped ranking of crypto founders and founding teams by estimated value created for outside holders and shareholders—not personal wealth.",
    images: ["/opengraph-image"],
    title: "IQ.wiki Estimated Value Created Ranking — Crypto Founders",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
