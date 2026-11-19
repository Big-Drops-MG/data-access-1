import { nextJsConfig } from "@workspace/config/eslint/next"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    files: ["scripts/**/*.mjs", "tests/e2e/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
]
