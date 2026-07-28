import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  transpilePackages: ["@crypto-founders/observability"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
