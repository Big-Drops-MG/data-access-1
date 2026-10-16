import { defineConfig } from "vitest/config"

/** Shared Vitest defaults for package/app projects (SD#16.1). */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "src/**/*.int.test.ts",
      "src/**/*.int.test.tsx",
    ],
    passWithNoTests: true,
  },
})
