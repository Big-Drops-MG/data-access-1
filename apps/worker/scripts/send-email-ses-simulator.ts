import { createHash, randomBytes } from "node:crypto"

import { getDb, getPool } from "@workspace/db/client"
import {
  createDomain,
  createMessage,
  createRecipient,
  createSender,
  createTemplate,
} from "@workspace/db/test"
import { createMailTransport } from "@workspace/emails"
import {
  BULLMQ_PREFIX,
  SEND_EMAIL_QUEUE_NAME,
  claimQueuedMessage,
  enqueueSendEmailJob,
  loadQueuedSend,
  loadServerEnv,
  markMessageFailed,
  markMessageSent,
  openSesAccountPausedAlert,
  releaseQueuedClaim,
  resetServerEnvCache,
  runSendEmailExclusive,
  skipQueuedMessageIfBlocked,
  type SendEmailJobData,
} from "@workspace/shared"
import { DelayedError, Queue, Worker } from "bullmq"
import { Redis } from "ioredis"

import {
  processSendEmailJob,
  sendEmailWorkerOptions,
} from "../src/send-email.ts"

const RECIPIENT = "success@simulator.amazonses.com"
const REGION = "us-east-1"
const CONFIGURATION_SET = "emailhub-dev-ses"
const FROM_DOMAIN = "e.quotifii.com"

type CreatedRows = {
  messageId?: string
  templateId?: string
  categoryId?: string
  userId?: string
  senderId?: string
  domainId?: string
  recipientId?: string
}

const created: CreatedRows = {}

function loopbackHost(value: string, label: string): void {
  const host = hostname(value, label)
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(`${label} is not on a loopback host`)
  }
}

function hostname(value: string, label: string): string {
  try {
    return new URL(value).hostname
  } catch {
    throw new Error(`${label} is not a URL`)
  }
}

function emailHash(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex")
}

function applyApprovedSesEnv(): string {
  if (process.env.EMAILHUB_ENV === "prod") {
    throw new Error("Refusing to send when EMAILHUB_ENV=prod")
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.EMAILHUB_ENV !== "dev"
  ) {
    throw new Error("Refusing to send in production")
  }
  const from = process.env.SES_FROM_EMAIL?.trim() ?? ""
  if (!/^[^@\s<>]+@e\.quotifii\.com$/i.test(from)) {
    throw new Error(`SES_FROM_EMAIL must be a mailbox on ${FROM_DOMAIN}`)
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials are not set")
  }
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
    throw new Error("DATABASE_URL and REDIS_URL are required")
  }
  loopbackHost(process.env.DATABASE_URL, "DATABASE_URL")
  loopbackHost(process.env.REDIS_URL, "REDIS_URL")
  process.env.MAIL_TRANSPORT = "ses"
  process.env.SES_REGION = REGION
  process.env.SES_CONFIGURATION_SET = CONFIGURATION_SET
  if (!process.env.SES_MAX_SEND_RATE) {
    process.env.SES_MAX_SEND_RATE = "1"
  }
  resetServerEnvCache()
  return from
}

async function main(): Promise<void> {
  const fromEmail = applyApprovedSesEnv()
  const env = loadServerEnv("worker")
  if (env.MAIL_TRANSPORT !== "ses" || env.SES_REGION !== REGION) {
    throw new Error("SES transport did not resolve to us-east-1")
  }
  if (env.SES_CONFIGURATION_SET !== CONFIGURATION_SET) {
    throw new Error("SES configuration set is not emailhub-dev-ses")
  }

  const pool = getPool()
  const database = getDb()
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
  const queue = new Queue(SEND_EMAIL_QUEUE_NAME, {
    connection: connection.duplicate(),
    prefix: BULLMQ_PREFIX,
  })
  let worker: Worker<SendEmailJobData> | undefined
  let pausedByUs = false

  try {
    await assertQueueIdle(queue)

    const hard = await pool.query(
      `select 1
       from suppression_entry
       where email_hash = $1
         and removed_at is null
         and source in ('hard_bounce', 'feedback_review')
       limit 1`,
      [emailHash(RECIPIENT)]
    )
    if ((hard.rowCount ?? 0) > 0) {
      throw new Error("Simulator recipient is hard-suppressed. Not sending.")
    }

    const existingRecipient = await pool.query<{ id: string; status: string }>(
      "select id, status from recipient where email = $1",
      [RECIPIENT]
    )
    const foundRecipient = existingRecipient.rows[0]
    if (foundRecipient && foundRecipient.status !== "active") {
      throw new Error("Simulator recipient is not active. Not sending.")
    }
    const recipientId = foundRecipient
      ? foundRecipient.id
      : await createRecipient(database, {
          email: RECIPIENT,
          status: "active",
        }).then((row) => {
          created.recipientId = row.id
          return row.id
        })

    const existingSender = await pool.query<{ id: string; status: string }>(
      "select id, status from sender where from_email = $1",
      [fromEmail]
    )
    const foundSender = existingSender.rows[0]
    if (foundSender && foundSender.status !== "active") {
      throw new Error("SES sender is not active. Not sending.")
    }
    const senderId = foundSender
      ? foundSender.id
      : await createVerifiedSender(database, fromEmail)

    const template = await createTemplate(database, {
      emailType: "thank_you",
      name: `T046 SES simulator ${randomBytes(3).toString("hex")}`,
      subject: `T046 SES simulator ${randomBytes(3).toString("hex")}`,
      bodySource: "<p>T046 SES simulator check</p>",
    })
    created.templateId = template.template.id
    created.categoryId = template.template.categoryId
    created.userId = template.template.createdBy

    const queued = await createMessage(database, {
      recipientId,
      senderId,
      templateVersionId: template.version.id,
      emailType: "thank_you",
      status: "queued",
      idempotencyKey: `t046-ses-${randomBytes(4).toString("hex")}`,
    })
    created.messageId = queued.id
    await assertQueueIdle(queue)
    await enqueueSendEmailJob(queue, queued.id)

    const options = sendEmailWorkerOptions({
      MAIL_TRANSPORT: "ses",
      SES_MAX_SEND_RATE: env.SES_MAX_SEND_RATE,
    })
    const transport = createMailTransport({
      MAIL_TRANSPORT: "ses",
      SES_REGION: REGION,
      SES_CONFIGURATION_SET: CONFIGURATION_SET,
    })
    const finished = waitForJob(queue, queued.id, () => worker)
    worker = new Worker<SendEmailJobData>(
      SEND_EMAIL_QUEUE_NAME,
      async (job, token) => {
        if (job.data.message_id !== queued.id) {
          await job.moveToDelayed(Date.now() + 1_000, token)
          throw new DelayedError()
        }
        await worker?.pause(true)
        await runSendEmailExclusive(
          database,
          job.data.message_id,
          async (tx) => {
            await processSendEmailJob(job.data, {
              load: (messageId) => loadQueuedSend(tx, messageId),
              skipIfSendChecksFail: (context) =>
                skipQueuedMessageIfBlocked(tx, context),
              markSent: (messageId, sesMessageId, sentAt) =>
                markMessageSent(tx, messageId, sesMessageId, sentAt),
              markFailed: (messageId, failureReason) =>
                markMessageFailed(tx, messageId, failureReason),
              claim: (messageId) => claimQueuedMessage(database, messageId),
              releaseClaim: (messageId) =>
                releaseQueuedClaim(database, messageId),
              transport,
              pauseQueue: async () => {
                pausedByUs = true
                await queue.pause()
              },
              openAccountPausedAlert: () => openSesAccountPausedAlert(tx),
            })
          }
        )
      },
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: 1,
        ...(options.limiter ? { limiter: options.limiter } : {}),
      }
    )

    await finished
    await reportRow(queued.id)
  } finally {
    if (pausedByUs) {
      await queue.resume().catch(() => undefined)
    }
    await Promise.race([
      worker?.close(true),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
    if (created.messageId) {
      const job = await queue.getJob(created.messageId).catch(() => undefined)
      await job?.remove().catch(() => undefined)
    }
    await cleanup(created)
    await queue.close().catch(() => undefined)
    connection.disconnect()
    await pool.end()
  }
}

function waitForJob(
  queue: Queue,
  messageId: string,
  current: () => Worker<SendEmailJobData> | undefined
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("simulator job timed out"))
    }, 60_000)
    const attach = (): void => {
      const worker = current()
      if (!worker) {
        setTimeout(attach, 10)
        return
      }
      worker.on("completed", (job) => {
        if (job.id === messageId) {
          clearTimeout(timer)
          resolve()
        }
      })
      worker.on("failed", (job, error) => {
        if (job?.id === messageId) {
          clearTimeout(timer)
          reject(
            error instanceof Error ? error : new Error("simulator job failed")
          )
        }
      })
    }
    attach()
    void queue
  })
}

async function assertQueueIdle(queue: Queue): Promise<void> {
  const counts = await queue.getJobCounts("waiting", "active", "delayed")
  if (
    (await queue.isPaused()) ||
    counts.waiting ||
    counts.active ||
    counts.delayed
  ) {
    throw new Error(
      "send-email queue is not empty. Refusing to start the simulator worker."
    )
  }
}

async function createVerifiedSender(
  database: ReturnType<typeof getDb>,
  fromEmail: string
): Promise<string> {
  const existingDomain = await getPool().query<{ id: string }>(
    "select id from domain where lower(name) = lower($1)",
    [FROM_DOMAIN]
  )
  const domainId =
    existingDomain.rows[0]?.id ??
    (await createDomain(database, {
      name: FROM_DOMAIN,
      status: "verified",
    }).then((row) => {
      created.domainId = row.id
      return row.id
    }))
  const sender = await createSender(database, {
    domainId,
    fromName: "Email Hub",
    fromEmail,
    status: "active",
  })
  created.senderId = sender.id
  return sender.id
}

async function reportRow(messageId: string): Promise<void> {
  const saved = await getPool().query<{
    status: string
    ses_message_id: string | null
    skip_reason: string | null
    failure_reason: string | null
  }>(
    "select status, ses_message_id, skip_reason, failure_reason from message where id = $1",
    [messageId]
  )
  const row = saved.rows[0]
  process.stdout.write(
    [
      "ses simulator result",
      `region=${REGION}`,
      `configuration_set=${CONFIGURATION_SET}`,
      `from_domain=${FROM_DOMAIN}`,
      `to=${RECIPIENT}`,
      `message_id=${messageId}`,
      `status=${row?.status ?? "missing"}`,
      `ses_message_id=${row?.ses_message_id ?? ""}`,
      `skip_reason=${row?.skip_reason ?? ""}`,
      `failure_reason=${row?.failure_reason ?? ""}`,
    ].join("\n") + "\n"
  )
  if (row?.status !== "sent" || !row.ses_message_id) {
    throw new Error(
      "Simulator job finished without status sent and ses_message_id"
    )
  }
}

async function cleanup(rows: CreatedRows): Promise<void> {
  const pool = getPool()
  const statements: [string, string][] = []
  if (rows.messageId) {
    statements.push(["delete from message where id = $1", rows.messageId])
  }
  if (rows.templateId) {
    statements.push([
      "update template set current_version_id = null where id = $1",
      rows.templateId,
    ])
    statements.push(["delete from template where id = $1", rows.templateId])
  }
  if (rows.categoryId) {
    statements.push([
      "delete from email_category where id = $1",
      rows.categoryId,
    ])
  }
  if (rows.senderId) {
    statements.push(["delete from sender where id = $1", rows.senderId])
  }
  if (rows.domainId) {
    statements.push(["delete from domain where id = $1", rows.domainId])
  }
  if (rows.recipientId) {
    statements.push(["delete from recipient where id = $1", rows.recipientId])
  }
  if (rows.userId) {
    statements.push(['delete from "user" where id = $1', rows.userId])
  }
  for (const [sql, id] of statements) {
    await pool.query(sql, [id]).catch(() => undefined)
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${describeError(error)}\n`)
  process.exit(1)
})

function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "simulator failed"
  }
  const cause =
    error.cause instanceof Error
      ? ` cause=${error.cause.name}: ${error.cause.message}`
      : ""
  return `${error.name}: ${error.message}${cause}`.slice(0, 500)
}
