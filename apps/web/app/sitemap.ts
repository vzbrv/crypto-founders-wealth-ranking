import type { MetadataRoute } from "next";

import {
  getResearchProjectIds,
  getUnifiedProjectIds,
} from "../lib/research-data";
import { getSiteUrl } from "../lib/site-metadata";
import { getProjectSlugs } from "../lib/transparency-data";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = ["/", "/methodology/", "/research/", "/sources/", "/status/"];
  return [
    ...routes,
    ...getProjectSlugs().map((slug) => `/project/${slug}/`),
    ...(await getResearchProjectIds()).map(
      (projectId) => `/research/${projectId}/`,
    ),
    ...(await getUnifiedProjectIds()).map((entryId) => `/ranking/${entryId}/`),
  ].map((route) => ({
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
    url: new URL(route, getSiteUrl()).toString(),
  }));
}
