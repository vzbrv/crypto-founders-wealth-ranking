import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getSiteUrl } from "../lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Crypto Founding Units Index",
    template: "%s · Crypto Founding Units Index",
  },
  description:
    "A transparent ranking of crypto founding units by estimated outside-holder token value.",
  applicationName: "Crypto Founding Units Index",
  alternates: { canonical: "/" },
  category: "finance",
  openGraph: {
    description:
      "A transparent ranking of crypto founding units by estimated outside-holder token value.",
    images: [{ alt: "Crypto Founding Units Index", url: "/opengraph-image" }],
    siteName: "Crypto Founding Units Index",
    title: "Crypto Founding Units Index",
    type: "website",
    url: "/",
  },
  robots: { follow: true, index: true },
  twitter: {
    card: "summary_large_image",
    description:
      "A transparent ranking of crypto founding units by estimated outside-holder token value.",
    images: ["/opengraph-image"],
    title: "Crypto Founding Units Index",
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
