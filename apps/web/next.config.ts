import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  transpilePackages: ["@superset-devin/contracts"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cognition.com",
        pathname: "/icon.svg",
      },
    ],
  },
}

export default nextConfig
