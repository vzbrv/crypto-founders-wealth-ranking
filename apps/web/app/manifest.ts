import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#07100e",
    description:
      "A transparent ranking of crypto founders and teams by estimated outside-holder wealth created.",
    display: "standalone",
    name: "Crypto Founders Wealth Index",
    short_name: "Crypto Founders",
    start_url: "/",
    theme_color: "#07100e",
  };
}
