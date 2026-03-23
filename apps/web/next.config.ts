import type { NextConfig } from "next";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const hubApiUrl = process.env.NEXT_PUBLIC_HUB_API_URL || "https://hub.agenticisland.ai";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@agentic-island/game-renderer", "@agentic-island/shared"],

  turbopack: {
    root: resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hub.agenticisland.ai",
      },
    ],
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${hubApiUrl}/api/:path*`,
      },
      {
        source: "/sprites/:path*",
        destination: `${hubApiUrl}/sprites/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${hubApiUrl}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
