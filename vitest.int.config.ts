import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Integration tests (SD#16.1): `*.int.test.ts`.
 * Postgres tests clone a migrated template database per Vitest worker.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "apps/email-hub/src"),
    },
  },
  test: {
    name: "int",
    environment: "node",
    globalSetup: ["./packages/db/test/global-setup.ts"],
    setupFiles: ["./packages/db/test/worker-setup.ts"],
    hookTimeout: 120_000,
    include: [
      "packages/**/src/**/*.int.test.ts",
      "packages/db/test/**/*.int.test.ts",
      "apps/**/src/**/*.int.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "packages/db/test/parallel/**",
    ],
    passWithNoTests: true,
    fileParallelism: false,
  },
})
