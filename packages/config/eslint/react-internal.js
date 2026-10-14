import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"

import { config as baseConfig } from "./base.js"

/**
 * ESLint config for internal React libraries (e.g. packages/ui).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
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
      react: pluginReact,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      "react/no-danger": "error",
    },
  },
  pluginReactHooks.configs.flat.recommended,
]
