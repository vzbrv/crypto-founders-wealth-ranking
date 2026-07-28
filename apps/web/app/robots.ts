import type { MetadataRoute } from "next";

import { getSiteUrl } from "../lib/site-metadata";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { allow: "/", userAgent: "*" },
    sitemap: new URL("/sitemap.xml", getSiteUrl()).toString(),
  };
}
