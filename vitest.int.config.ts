import { defineConfig } from "vitest/config"

/**
 * Integration tests (SD#16.1): `*.int.test.ts` next to source.
 * Run with real Postgres / ClickHouse / Redis / Mailpit in CI.
 */
export default defineConfig({
  test: {
    name: "int",
    environment: "node",
    include: [
      "packages/**/src/**/*.int.test.ts",
      "apps/**/src/**/*.int.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    passWithNoTests: true,
    fileParallelism: false,
  },
})
