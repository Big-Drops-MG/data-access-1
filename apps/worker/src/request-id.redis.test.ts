import { spawn, type ChildProcess } from "node:child_process"
import net from "node:net"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { Queue } from "bullmq"
import { afterAll, describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const redisHost = "127.0.0.1"
const redisPort = 6399
const redisUrl = `redis://${redisHost}:${redisPort}`

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

async function portOpen(port: number): Promise<boolean> {
  return new Promise((resolveOpen) => {
    const socket = net.connect({ host: redisHost, port })
    const finish = (open: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolveOpen(open)
    }
    socket.setTimeout(500)
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
    socket.once("timeout", () => finish(false))
  })
}

const redisAvailable = await portOpen(redisPort)
let workerOutput = ""

function workerEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    EMAILHUB_ENV: "dev",
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    LOG_FORMAT: "json",
    DATABASE_URL: "postgresql://emailhub_app:emailhub@127.0.0.1:1/emailhub",
    REDIS_URL: redisUrl,
    CLICKHOUSE_URL: "http://127.0.0.1:1",
    MAIL_TRANSPORT: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
  }
}

describe.skipIf(!redisAvailable)("worker request_id on isolated redis", () => {
  const queue = new Queue("send-email", {
    connection: {
      host: redisHost,
      port: redisPort,
      maxRetriesPerRequest: null,
    },
    prefix: "bd",
  })
  let child: ChildProcess | undefined

  afterAll(async () => {
    if (child && !child.killed) {
      child.kill("SIGTERM")
    }
    await queue.obliterate({ force: true }).catch(() => undefined)
    await queue.close()
  })

  it("logs the same request id the job was given and handles a legacy job", async () => {
    const workerEntry = require.resolve("@workspace/worker")
    child = spawn(process.execPath, [workerEntry], {
      cwd: root,
      env: workerEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    })
    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => {
      workerOutput += chunk
    })
    child.stderr?.on("data", (chunk: string) => {
      workerOutput += chunk
    })

    await waitFor(() => workerOutput.includes("worker.ready"), 45_000)

    await queue.add(
      "send-email",
      { message_id: "msg-a", request_id: "req-aaa" },
      { jobId: "msg-a" }
    )
    await queue.add(
      "send-email",
      { message_id: "msg-b", request_id: "req-bbb" },
      { jobId: "msg-b" }
    )
    await queue.add(
      "send-email",
      { message_id: "msg-legacy" },
      { jobId: "msg-legacy" }
    )
    await queue.add(
      "send-email",
      { message_id: "msg-delayed", request_id: "req-delayed" },
      { jobId: "msg-delayed", delay: 200 }
    )

    await waitFor(
      () =>
        workerOutput.includes("req-aaa") &&
        workerOutput.includes("req-bbb") &&
        workerOutput.includes("req-delayed") &&
        workerOutput.includes("msg-legacy"),
      45_000
    )

    const lines = workerOutput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    const forJob = (messageId: string, requestId: string) =>
      lines.find(
        (line) =>
          line.message_id === messageId &&
          line.request_id === requestId &&
          line.event === "job.started"
      )
    expect(forJob("msg-a", "req-aaa")).toBeTruthy()
    expect(forJob("msg-b", "req-bbb")).toBeTruthy()
    expect(forJob("msg-delayed", "req-delayed")).toBeTruthy()

    const legacy = lines.find(
      (line) => line.message_id === "msg-legacy" && line.event === "job.started"
    )
    expect(typeof legacy?.request_id).toBe("string")
    expect(legacy?.request_id).not.toBe("req-aaa")
    expect(legacy?.request_id).not.toBe("req-bbb")

    const legacyJob = await queue.getJob("msg-legacy")
    expect(legacyJob?.data.request_id).toBe(legacy?.request_id)

    const kept = await queue.getJob("msg-a")
    expect(kept?.data.request_id).toBe("req-aaa")
  }, 90_000)
})

async function waitFor(ready: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (!ready()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for worker output:\n${workerOutput}`)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
}
