import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "../lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Top Crypto Founders Ranked by Value Created for Others.",
    template: "%s · IQ.wiki Value Created Index",
  },
  description:
    "A transparent, time-stamped ranking of crypto founders and founding teams by provisional value created for outside holders and shareholders—not personal wealth.",
  applicationName: "IQ.wiki Value Created Index",
  alternates: { canonical: "/" },
  category: "finance",
  openGraph: {
    description:
      "A transparent, time-stamped ranking of crypto founders and founding teams by provisional value created for outside holders and shareholders—not personal wealth.",
    images: [
      {
        alt: "Top Crypto Founders Ranked by Value Created for Others.",
        url: "/opengraph-image",
      },
    ],
    siteName: "IQ.wiki Value Created Index",
    title: "Top Crypto Founders Ranked by Value Created for Others.",
    type: "website",
    url: "/",
  },
  robots: { follow: true, index: true },
  twitter: {
    card: "summary_large_image",
    description:
      "A transparent, time-stamped ranking of crypto founders and founding teams by provisional value created for outside holders and shareholders—not personal wealth.",
    images: ["/opengraph-image"],
    title: "Top Crypto Founders Ranked by Value Created for Others.",
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
