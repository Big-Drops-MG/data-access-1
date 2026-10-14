import { globalIgnores } from "eslint/config"
import pluginNext from "@next/eslint-plugin-next"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"

import { config as baseConfig } from "./base.js"
import workspacePlugin from "./plugins/workspace.js"

/**
 * ESLint config for Next.js apps (apps/email-hub).
 * Adds React/Next rules, bans dangerouslySetInnerHTML except template preview,
 * and blocks cross-feature imports (SD#12.1 / SD#14.5).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const nextJsConfig = [
  ...baseConfig,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    plugins: {
      "@next/next": pluginNext,
      react: pluginReact,
      workspace: workspacePlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      "react/no-danger": "error",
      "workspace/no-cross-feature-imports": "error",
    },
  },
  pluginReactHooks.configs.flat.recommended,
  {
    files: [
      "**/*preview*.{ts,tsx,js,jsx}",
      "**/preview/**/*.{ts,tsx,js,jsx}",
      "**/template-preview/**/*.{ts,tsx,js,jsx}",
    ],
    rules: {
      "react/no-danger": "off",
    },
  },
]
