import { globalIgnores } from "eslint/config"

import { config as baseConfig } from "@workspace/config/eslint/base"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/.turbo/**",
    "**/coverage/**",
    "apps/**",
    "packages/**",
  ]),
]
