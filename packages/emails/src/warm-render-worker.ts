import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"

const compiled = new URL("./render-worker.js", import.meta.url)
const workerUrl = existsSync(fileURLToPath(compiled))
  ? compiled
  : new URL("./render-worker.ts", import.meta.url)
const env: Record<string, string> = {}
for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "PATHEXT"]) {
  const value = process.env[key]
  if (value) {
    env[key] = value
  }
}

const worker = new Worker(workerUrl, {
  execArgv: [],
  resourceLimits: {
    maxOldGenerationSizeMb: 32,
    maxYoungGenerationSizeMb: 8,
    codeRangeSizeMb: 16,
    stackSizeMb: 4,
  },
  env,
})

try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("render worker warmup timed out"))
    }, 20_000)
    let ready = false
    worker.on("message", () => {
      if (!ready) {
        ready = true
        worker.postMessage({ kind: "render", tree: { k: "tx", v: "ok" } })
        return
      }
      clearTimeout(timer)
      resolve()
    })
    worker.once("error", () => {
      clearTimeout(timer)
      reject(new Error("render worker warmup failed"))
    })
  })
} finally {
  await worker.terminate()
}
