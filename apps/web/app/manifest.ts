import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#0F172A",
    description:
      "A transparent, time-stamped ranking of crypto founders and founding teams by provisional value created for outside holders and shareholders—not personal wealth.",
    display: "standalone",
    name: "IQ.wiki Value Created Index",
    short_name: "Crypto Founders",
    start_url: "/",
    theme_color: "#FF5CAA",
  };
}
