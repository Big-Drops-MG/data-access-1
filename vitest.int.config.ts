import { defineConfig } from "vitest/config"

/**
 * Integration tests (SD#16.1): `*.int.test.ts`.
 * Postgres tests clone a migrated template database per Vitest worker.
 */
export default defineConfig({
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
