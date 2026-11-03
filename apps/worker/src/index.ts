import { getDb } from "@workspace/db/client"
import { createMailTransport } from "@workspace/emails"
import {
  WORKER_SERVICE,
  createLogger,
  getContextLogger,
  readJobCorrelation,
  resolveRequestId,
  runWithRequestContext,
  setFallbackLogger,
} from "@workspace/logger"
import {
  claimQueuedMessage,
  loadQueuedSend,
  loadServerEnv,
  markMessageFailed,
  markMessageSent,
  openSesAccountPausedAlert,
  releaseQueuedClaim,
  runSendEmailExclusive,
  SEND_EMAIL_QUEUE_NAME,
  skipQueuedMessageIfBlocked,
  type SendEmailJobData,
} from "@workspace/shared"
import { Queue, Worker, type Job } from "bullmq"
import { Redis } from "ioredis"

import { BULLMQ_PREFIX, QUEUE_NAMES, type QueueName } from "./queues.js"
import { processSendEmailJob, sendEmailWorkerOptions } from "./send-email.js"

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

async function withJobLogs(
  queueName: QueueName,
  job: Job,
  run: () => Promise<void>
): Promise<void> {
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
        await run()
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

async function processJob(queueName: QueueName, job: Job): Promise<void> {
  await withJobLogs(queueName, job, async () => undefined)
}

async function main(): Promise<void> {
  const env = loadServerEnv("worker")
  const sendOptions = sendEmailWorkerOptions(env)
  const db = getDb()
  const transport = createMailTransport(env)

  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  })
  const queueConnection = connection.duplicate()

  await connection.ping()

  const sendEmailQueue = new Queue(SEND_EMAIL_QUEUE_NAME, {
    connection: queueConnection,
    prefix: BULLMQ_PREFIX,
  })

  const workers: Worker[] = QUEUE_NAMES.filter(
    (name) => name !== SEND_EMAIL_QUEUE_NAME
  ).map(
    (name) =>
      new Worker(name, (job) => processJob(name, job), {
        connection,
        prefix: BULLMQ_PREFIX,
      })
  )

  workers.push(
    new Worker<SendEmailJobData>(
      SEND_EMAIL_QUEUE_NAME,
      (job) =>
        withJobLogs(SEND_EMAIL_QUEUE_NAME, job, async () => {
          await runSendEmailExclusive(db, job.data.message_id, async (tx) => {
            await processSendEmailJob(job.data, {
              load: (messageId) => loadQueuedSend(tx, messageId),
              skipIfSendChecksFail: (context) =>
                skipQueuedMessageIfBlocked(tx, context),
              markSent: (messageId, sesMessageId, sentAt) =>
                markMessageSent(tx, messageId, sesMessageId, sentAt),
              markFailed: (messageId, failureReason) =>
                markMessageFailed(tx, messageId, failureReason),
              claim: (messageId) => claimQueuedMessage(db, messageId),
              releaseClaim: (messageId) => releaseQueuedClaim(db, messageId),
              transport,
              compliance: {
                origin: env.BETTER_AUTH_URL,
                secret: env.UNSUBSCRIBE_TOKEN_SECRET,
              },
              pauseQueue: () => sendEmailQueue.pause(),
              openAccountPausedAlert: () => openSesAccountPausedAlert(tx),
            })
          })
        }),
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: sendOptions.concurrency,
        ...(sendOptions.limiter ? { limiter: sendOptions.limiter } : {}),
      }
    )
  )

  const limiterLabel = sendOptions.limiter
    ? `${String(sendOptions.limiter.max)}/s`
    : "off"
  logger.info(
    {
      event: "worker.ready",
      queues: QUEUE_NAMES,
      prefix: BULLMQ_PREFIX,
      send_email_concurrency: sendOptions.concurrency,
      send_email_limiter: limiterLabel,
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
    await sendEmailQueue.close()
    await connection.quit()
    await queueConnection.quit()
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
