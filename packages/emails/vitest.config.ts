import { defineProject, mergeConfig } from "vitest/config"

import shared from "../../vitest.shared.js"

export default mergeConfig(
  shared,
  defineProject({
    test: {
      name: "emails",
      // Render-worker startup counts toward the 5s deadline; keep this project serial.
      maxWorkers: 1,
      fileParallelism: false,
      setupFiles: ["./src/warm-render-worker.ts"],
    },
  })
)
