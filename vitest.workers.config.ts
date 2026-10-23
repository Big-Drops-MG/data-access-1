import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * Two Vitest workers, each cloning the migrated Postgres template.
 * Run with `pnpm test:int:workers`.
 */
export default defineConfig({
  test: {
    name: "workers",
    root,
    environment: "node",
    globalSetup: ["./packages/db/test/global-setup.ts"],
    setupFiles: ["./packages/db/test/worker-setup.ts"],
    hookTimeout: 120_000,
    include: ["packages/db/test/parallel/**/*.int.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: true,
    maxWorkers: 2,
    minWorkers: 2,
  },
})
