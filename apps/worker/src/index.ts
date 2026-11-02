import { loadServerEnv, SEND_EMAIL_QUEUE_NAME } from "@workspace/shared"
import {
  WORKER_SERVICE,
  createLogger,
  getContextLogger,
  readJobCorrelation,
  resolveRequestId,
  runWithRequestContext,
  setFallbackLogger,
} from "@workspace/logger"
import { Worker, type Job } from "bullmq"
import { Redis } from "ioredis"

import { BULLMQ_PREFIX, QUEUE_NAMES, type QueueName } from "./queues.js"

const logger = createLogger({ service: WORKER_SERVICE })
setFallbackLogger(logger)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function correlationIdFor(job: Job): Promise<string> {
  const existing = readJobCorrelation(job.data).requestId
  if (existing) {
    return existing
  }

  const requestId = resolveRequestId(undefined)
  if (isPlainRecord(job.data)) {
    try {
      await job.updateData({ ...job.data, request_id: requestId })
    } catch (error) {
      logger.warn(
        {
          event: "job.request_id_persist_failed",
          job_id: job.id,
          err: error,
        },
        "Could not persist request_id"
      )
    }
  }
  return requestId
}

async function processJob(queueName: QueueName, job: Job): Promise<void> {
  const correlation = readJobCorrelation(job.data)
  const requestId = await correlationIdFor(job)
  const started = Date.now()
  const attempt = job.attemptsMade + 1
  const jobLogger = logger.child({
    request_id: requestId,
    ...(job.id ? { job_id: job.id } : {}),
    ...(correlation.messageId ? { message_id: correlation.messageId } : {}),
    ...(correlation.workspaceId
      ? { workspace_id: correlation.workspaceId }
      : {}),
  })

  await runWithRequestContext(
    requestId,
    async () => {
      const scoped = getContextLogger()

      if (job.attemptsMade > 0) {
        scoped.warn(
          { event: "job.retry", queue: queueName, attempt },
          "Job retry"
        )
      }

      scoped.info(
        { event: "job.started", queue: queueName, attempt },
        "Job started"
      )

      try {
        if (queueName === SEND_EMAIL_QUEUE_NAME) {
          scoped.warn(
            {
              event: "send_email.processor_unavailable",
              queue: queueName,
            },
            "Send-email processor is not registered"
          )
        }

        scoped.info(
          {
            event: "job.completed",
            queue: queueName,
            duration_ms: Date.now() - started,
          },
          "Job completed"
        )
      } catch (error) {
        scoped.error(
          {
            event: "job.failed",
            queue: queueName,
            duration_ms: Date.now() - started,
            err: error,
          },
          "Job failed"
        )
        throw error
      }
    },
    jobLogger
  )
}

async function main(): Promise<void> {
  const env = loadServerEnv("worker")

  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  })

  await connection.ping()

  const workers = QUEUE_NAMES.map(
    (name) =>
      new Worker(name, (job) => processJob(name, job), {
        connection,
        prefix: BULLMQ_PREFIX,
      })
  )

  logger.info(
    {
      event: "worker.ready",
      queues: QUEUE_NAMES,
      prefix: BULLMQ_PREFIX,
    },
    "Worker ready"
  )

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    logger.info(
      { event: "worker.shutting_down", signal },
      "Worker shutting down"
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
  logger.fatal(
    { event: "worker.boot_failed", err: error },
    "Worker failed to start"
  )
  process.exit(1)
})
