import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: [
    "@workspace/ui",
    "@workspace/shared",
    "@workspace/logger",
  ],
  serverExternalPackages: ["@workspace/db", "ioredis", "pg", "pino"],
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
}

export default nextConfig
