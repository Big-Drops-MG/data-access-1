import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/shared"],
  serverExternalPackages: [
    "@workspace/db",
    "@workspace/emails",
    "@workspace/logger",
    "@bull-board/api",
    "@bull-board/ui",
    "@bull-board/hono",
    "bullmq",
    "ioredis",
    "pg",
    "pino",
  ],
  outputFileTracingIncludes: {
    "/admin/queues": ["./node_modules/@bull-board/ui/**/*"],
    "/admin/queues/[...path]": ["./node_modules/@bull-board/ui/**/*"],
    "/admin/queues/[[...path]]": ["./node_modules/@bull-board/ui/**/*"],
  },
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
