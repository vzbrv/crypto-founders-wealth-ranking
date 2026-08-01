import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#07100e",
    description:
      "A transparent provisional ranking of crypto founders and joint founding teams by project circulating market value minus verified affiliated holdings and reviewed outside capital.",
    display: "standalone",
    name: "Crypto Founders Value Created Index",
    short_name: "Crypto Founders",
    start_url: "/",
    theme_color: "#07100e",
  };
}
