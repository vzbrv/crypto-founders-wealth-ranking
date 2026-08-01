import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#07100e",
    description:
      "A transparent ranking of crypto founding units by estimated outside-holder token value.",
    display: "standalone",
    name: "Crypto Founding Units Index",
    short_name: "Founding Units",
    start_url: "/",
    theme_color: "#07100e",
  };
}
