import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineProject, mergeConfig } from "vitest/config"

import shared from "../../vitest.shared.js"

const root = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(
  shared,
  defineProject({
    resolve: {
      alias: {
        "@": path.join(root, "src"),
      },
    },
    test: {
      name: "email-hub",
    },
  })
)
