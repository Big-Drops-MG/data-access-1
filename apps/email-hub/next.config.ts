import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/shared"],
  async redirects() {
    return [
      {
        source: "/feedback",
        destination: "/complaints",
        permanent: false,
      },
      {
        source: "/feedback/:id",
        destination: "/complaints/:id",
        permanent: false,
      },
    ]
  },
  serverExternalPackages: [
    "@workspace/db",
    "@workspace/emails",
    "@workspace/logger",
    "@bull-board/api",
    "@bull-board/ui",
    "@bull-board/hono",
    "bullmq",
    "ioredis",
    "mailparser",
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
