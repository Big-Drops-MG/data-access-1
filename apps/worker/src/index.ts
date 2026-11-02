import { getDb } from "@workspace/db/client"
import { createMailTransport } from "@workspace/emails"
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
import { Queue, Worker } from "bullmq"
import { Redis } from "ioredis"

import { BULLMQ_PREFIX, QUEUE_NAMES } from "./queues.js"
import { processSendEmailJob, sendEmailWorkerOptions } from "./send-email.js"

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
      new Worker(name, async () => undefined, {
        connection,
        prefix: BULLMQ_PREFIX,
      })
  )

  workers.push(
    new Worker<SendEmailJobData>(
      SEND_EMAIL_QUEUE_NAME,
      async (job) => {
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
            pauseQueue: () => sendEmailQueue.pause(),
            openAccountPausedAlert: () => openSesAccountPausedAlert(tx),
          })
        })
      },
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
  process.stdout.write(
    `worker ready (prefix=${BULLMQ_PREFIX}, queues=${QUEUE_NAMES.join(",")}, send-email concurrency=${String(sendOptions.concurrency)}, limiter=${limiterLabel})${String.fromCharCode(10)}`
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
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  process.stderr.write(`${message}${String.fromCharCode(10)}`)
  process.exit(1)
})
