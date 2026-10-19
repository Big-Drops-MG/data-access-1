import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/shared"],
  serverExternalPackages: ["@workspace/db", "ioredis", "pg"],
  output: "standalone",
}

export default nextConfig
