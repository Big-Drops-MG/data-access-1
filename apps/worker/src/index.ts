import { loadServerEnv } from "@workspace/shared"
import { Worker } from "bullmq"
import { Redis } from "ioredis"

import { BULLMQ_PREFIX, QUEUE_NAMES } from "./queues.js"

async function main(): Promise<void> {
  const env = loadServerEnv("worker")

  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  })

  await connection.ping()

  const workers = QUEUE_NAMES.map(
    (name) =>
      new Worker(name, async () => undefined, {
        connection,
        prefix: BULLMQ_PREFIX,
      })
  )

  process.stdout.write(
    `worker ready (prefix=${BULLMQ_PREFIX}, queues=${QUEUE_NAMES.join(",")})${String.fromCharCode(10)}`
  )

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    process.stdout.write(
      `worker shutting down (${signal})${String.fromCharCode(10)}`
    )
    await Promise.all(workers.map((worker) => worker.close()))
    await connection.quit()
    process.exit(0)
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM")
  })
  process.on("SIGINT", () => {
    void shutdown("SIGINT")
  })
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`${message}${String.fromCharCode(10)}`)
  process.exit(1)
})
