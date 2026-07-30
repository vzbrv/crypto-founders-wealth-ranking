import type { MetadataRoute } from "next";

import { getSiteUrl } from "../lib/site-metadata";
import { getProjectSlugs } from "../lib/transparency-data";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/methodology/", "/sources/", "/status/"];
  return [
    ...routes,
    ...getProjectSlugs().map((slug) => `/project/${slug}/`),
  ].map((route) => ({
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
    url: new URL(route, getSiteUrl()).toString(),
  }));
}
