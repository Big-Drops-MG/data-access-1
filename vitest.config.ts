import { defineConfig } from "vitest/config"

/**
 * Root Vitest projects + coverage (T-013 / SD#16.1, SD#16.5).
 * Unit: `*.test.ts` (excludes `*.int.test.ts` via project configs).
 * Integration: `pnpm test:int` → vitest.int.config.ts.
 */
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "packages/shared/src/**/*.{ts,tsx}",
        "apps/worker/src/**/*.{ts,tsx}",
        "apps/email-hub/src/lib/**/*.{ts,tsx}",
        "apps/email-hub/src/app/api/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.{test,spec,int.test}.{ts,tsx}",
        "**/index.ts",
        "**/*.d.ts",
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        // Browser-only helper; not unit-tested in Node.
        "apps/email-hub/src/lib/tokens.ts",
      ],
      thresholds: {
        // packages/shared — 90%
        "packages/shared/**": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        // apps/worker — 80%
        "apps/worker/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
        // web server (email-hub lib + API routes) — 80%
        "apps/email-hub/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
})
