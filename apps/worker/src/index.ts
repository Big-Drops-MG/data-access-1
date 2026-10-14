import { Worker } from "bullmq"
import { Redis } from "ioredis"

const BULLMQ_PREFIX = "bd"

const QUEUE_NAMES = [
  "send-email",
  "dispatch",
  "events",
  "sync",
  "monitoring",
  "intake",
  "maintenance",
] as const

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error("REDIS_URL is required")
  }

  const connection = new Redis(redisUrl, {
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
