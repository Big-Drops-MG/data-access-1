import { defineProject, mergeConfig } from "vitest/config"

import shared from "../../vitest.shared.js"

export default mergeConfig(
  shared,
  defineProject({
    test: {
      name: "db",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx", "test/**/*.test.ts"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/coverage/**",
        "src/**/*.int.test.ts",
        "src/**/*.int.test.tsx",
        "test/**/*.int.test.ts",
      ],
    },
  })
)
