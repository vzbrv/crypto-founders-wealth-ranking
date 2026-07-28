import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "../lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Crypto Founders Wealth Index",
    template: "%s · Crypto Founders Wealth Index",
  },
  description:
    "A transparent ranking of crypto founders and teams by estimated outside-holder wealth created.",
  applicationName: "Crypto Founders Wealth Index",
  alternates: { canonical: "/" },
  category: "finance",
  openGraph: {
    description:
      "A transparent ranking of crypto founders and teams by estimated outside-holder wealth created.",
    images: [{ alt: "Crypto Founders Wealth Index", url: "/opengraph-image" }],
    siteName: "Crypto Founders Wealth Index",
    title: "Crypto Founders Wealth Index",
    type: "website",
    url: "/",
  },
  robots: { follow: true, index: true },
  twitter: {
    card: "summary_large_image",
    description:
      "A transparent ranking of crypto founders and teams by estimated outside-holder wealth created.",
    images: ["/opengraph-image"],
    title: "Crypto Founders Wealth Index",
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
