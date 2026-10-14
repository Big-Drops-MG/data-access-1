import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import turboPlugin from "eslint-plugin-turbo"
import vitest from "@vitest/eslint-plugin"
import tseslint from "typescript-eslint"

/**
 * Shared ESLint base for every workspace package.
 * Enforces TypeScript strict habits from the developer rules:
 * no `any`, no silent `@ts-ignore`, no leftover console noise.
 * Also bans focused/disabled Vitest tests without an issue ref (T-015 / SD#16.5).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      turbo: turboPlugin,
      vitest,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='only']",
          message:
            "Focused tests (describe/it/test.only) are banned. Remove .only before committing.",
        },
        {
          selector:
            "CallExpression[callee.object.name=/^(describe|it|test)$/][callee.property.name='skip']",
          message:
            "Skipped tests (describe/it/test.skip) need an issue ref. Use eslint-disable-next-line with T-### or #issue in the comment, then remove the skip when fixed.",
        },
        {
          selector:
            "CallExpression[callee.object.object.name='describe'][callee.object.property.name='skip']",
          message:
            "Skipped tests need an issue ref. Use eslint-disable-next-line with T-### or #issue in the comment.",
        },
      ],
    },
  },
  {
    files: [
      "**/*.{test,spec}.{ts,tsx,js,jsx}",
      "**/__tests__/**/*.{ts,tsx,js,jsx}",
    ],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-focused-tests": "error",
      // Covered by no-restricted-syntax so the message can require a T-### / #issue ref.
      "vitest/no-disabled-tests": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".next/**",
      "coverage/**",
      ".turbo/**",
      "build/**",
      "out/**",
    ],
  }
)
