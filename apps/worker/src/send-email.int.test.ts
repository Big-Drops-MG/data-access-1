import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { suppressionEntry } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import {
  createMessage,
  createRecipient,
  createSender,
  createTemplate,
  findMessage,
  findOpenAlerts,
} from "@workspace/db/test"
import { MailTransportError, createMailTransport } from "@workspace/emails"
import {
  BULLMQ_PREFIX,
  SEND_EMAIL_JOB_OPTIONS,
  SEND_EMAIL_QUEUE_NAME,
  enqueueSendEmailJob,
  SES_ACCOUNT_PAUSED_DEDUPE_KEY,
  claimQueuedMessage,
  loadQueuedSend,
  markMessageFailed,
  markMessageSent,
  openSesAccountPausedAlert,
  releaseQueuedClaim,
  runSendEmailExclusive,
  skipQueuedMessageIfBlocked,
  uuidSchema,
  type QueuedSendContext,
} from "@workspace/shared"
import { Queue, UnrecoverableError, Worker, type RedisOptions } from "bullmq"
import { describe, expect, inject, it, vi } from "vitest"

import {
  processSendEmailJob,
  sendEmailWorkerOptions,
  type SendEmailJobDeps,
} from "./send-email.js"

declare module "vitest" {
  interface ProvidedContext {
    emailhubTemplateDatabase: string
  }
}

const templateName = inject("emailhubTemplateDatabase")
const FIRST_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"
const SECOND_ID = "0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d44"

function loopbackRedisUrl(): string | null {
  const candidates = [
    process.env.REDIS_URL,
    readEnvValue(path.resolve("apps/email-hub/.env"), "REDIS_URL"),
  ]
  for (const value of candidates) {
    if (!value) {
      continue
    }
    try {
      const url = new URL(value)
      const loopback =
        url.hostname === "127.0.0.1" || url.hostname === "localhost"
      if (
        loopback &&
        (url.protocol === "redis:" || url.protocol === "rediss:")
      ) {
        return value
      }
    } catch {
      continue
    }
  }
  return null
}

function readEnvValue(file: string, key: string): string | null {
  if (!fs.existsSync(file)) {
    return null
  }
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`))
  if (!line) {
    return null
  }
  return line
    .slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
}

function redisOptions(url: string): RedisOptions {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parsed.port === "" ? 6379 : Number(parsed.port),
    ...(parsed.password === ""
      ? {}
      : { password: decodeURIComponent(parsed.password) }),
    maxRetriesPerRequest: null,
  }
}

function queuedContext(messageId: string): QueuedSendContext {
  const now = new Date("2026-10-30T12:00:00.000Z")
  return {
    messageId,
    recipient: {
      id: "0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d45",
      email: "t046-active@example.com",
      emailHash: "hash",
      externalUserId: null,
      tier: "standard",
      tierUpdatedAt: now,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastEmailedAt: null,
    },
    emailType: "engagement",
    offerId: null,
    categoryId: "0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d46",
    subject: "Hello",
    bodySource: "<p>Hi Ada</p>",
    fromName: "Big Drops",
    fromEmail: "news@example.com",
    replyTo: null,
  }
}

function accountPausedError(): MailTransportError {
  const cause = new Error("Account sending paused")
  cause.name = "AccountSendingPausedException"
  Object.assign(cause, { $metadata: { httpStatusCode: 400 } })
  return new MailTransportError("SES send failed", { cause })
}

const redisUrl = loopbackRedisUrl()

describe.skipIf(!redisUrl)("send-email queue isolation", () => {
  const prefix = `${BULLMQ_PREFIX}t046${randomBytes(3).toString("hex")}`

  function isolatedQueue(): Queue {
    return new Queue(SEND_EMAIL_QUEUE_NAME, {
      connection: redisOptions(redisUrl ?? ""),
      prefix,
    })
  }

  it("enqueues with the producer attempts and exponential backoff", async () => {
    expect(uuidSchema.safeParse(FIRST_ID).success).toBe(true)
    expect(uuidSchema.safeParse(SECOND_ID).success).toBe(true)
    const queue = isolatedQueue()
    try {
      await enqueueSendEmailJob(queue, FIRST_ID)
      await enqueueSendEmailJob(queue, FIRST_ID).catch(() => undefined)
      const job = await queue.getJob(FIRST_ID)
      const counts = await queue.getJobCounts("waiting", "delayed", "active")
      expect(job?.name).toBe("send-email")
      expect(job?.data).toEqual({ message_id: FIRST_ID })
      expect(job?.opts.attempts).toBe(SEND_EMAIL_JOB_OPTIONS.attempts)
      expect(job?.opts.backoff).toEqual(SEND_EMAIL_JOB_OPTIONS.backoff)
      expect(counts.waiting).toBe(1)
      expect(
        sendEmailWorkerOptions({
          MAIL_TRANSPORT: "ses",
          SES_MAX_SEND_RATE: "2",
        })
      ).toEqual({
        concurrency: 10,
        limiter: { max: 2, duration: 1_000 },
      })
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it("keeps at most 10 sends active and finishes all 25 jobs", async () => {
    const queue = isolatedQueue()
    let active = 0
    let maxActive = 0
    let release = (): void => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = 0
    const worker = new Worker(
      SEND_EMAIL_QUEUE_NAME,
      async () => {
        active += 1
        started += 1
        maxActive = Math.max(maxActive, active)
        if (started === 10) {
          setTimeout(release, 200)
        }
        await gate
        active -= 1
      },
      {
        connection: redisOptions(redisUrl ?? ""),
        prefix,
        concurrency: sendEmailWorkerOptions({
          MAIL_TRANSPORT: "smtp",
        }).concurrency,
      }
    )
    const finished = new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("concurrency jobs did not finish")),
        15_000
      )
      let completed = 0
      worker.on("completed", () => {
        completed += 1
        if (completed === 25) {
          clearTimeout(timer)
          resolve(completed)
        }
      })
    })
    try {
      for (let index = 0; index < 25; index += 1) {
        await enqueueSendEmailJob(queue, `${FIRST_ID}-c${String(index)}`)
      }
      await worker.waitUntilReady()
      expect(await finished).toBe(25)
      expect(maxActive).toBe(10)
    } finally {
      release()
      await worker.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it("starts at most SES_MAX_SEND_RATE jobs per second on one worker", async () => {
    const queue = isolatedQueue()
    const starts: number[] = []
    const options = sendEmailWorkerOptions({
      MAIL_TRANSPORT: "ses",
      SES_MAX_SEND_RATE: "2",
    })
    const worker = new Worker(
      SEND_EMAIL_QUEUE_NAME,
      async () => {
        starts.push(Date.now())
      },
      {
        connection: redisOptions(redisUrl ?? ""),
        prefix,
        concurrency: options.concurrency,
        limiter: options.limiter,
      }
    )
    const finished = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("rate-limited jobs did not finish")),
        20_000
      )
      let completed = 0
      worker.on("completed", () => {
        completed += 1
        if (completed === 10) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
    try {
      for (let index = 0; index < 10; index += 1) {
        await enqueueSendEmailJob(queue, `${SECOND_ID}-r${String(index)}`)
      }
      await finished
      const first = starts[0] ?? 0
      const last = starts[9] ?? 0
      expect(starts).toHaveLength(10)
      expect(last - first).toBeGreaterThanOrEqual(3_500)
    } finally {
      await worker.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it("retries throttling with exponential delays and stops after 5 attempts", async () => {
    const queue = isolatedQueue()
    const stamps: number[] = []
    const worker = new Worker(
      SEND_EMAIL_QUEUE_NAME,
      async () => {
        stamps.push(Date.now())
        const cause = new Error("throttled")
        cause.name = "ThrottlingException"
        Object.assign(cause, { $metadata: { httpStatusCode: 429 } })
        const error = new Error("SES send failed", { cause })
        error.name = "MailTransportError"
        throw error
      },
      {
        connection: redisOptions(redisUrl ?? ""),
        prefix,
        concurrency: 1,
      }
    )
    try {
      await enqueueSendEmailJob(queue, `${FIRST_ID}-throttle`)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("throttled job did not exhaust attempts")),
          50_000
        )
        worker.on("failed", (job) => {
          if (job?.attemptsMade === 5) {
            clearTimeout(timer)
            resolve()
          }
        })
      })
      const job = await queue.getJob(`${FIRST_ID}-throttle`)
      expect(stamps).toHaveLength(5)
      expect(job?.attemptsMade).toBe(5)
      const gaps = stamps
        .slice(1)
        .map((stamp, index) => stamp - (stamps[index] ?? stamp))
      const expected = [2_000, 4_000, 8_000, 16_000]
      gaps.forEach((gap, index) => {
        const delay = expected[index] ?? 0
        expect(gap).toBeGreaterThanOrEqual(delay - 400)
        expect(gap).toBeLessThan(delay + 2_500)
      })
    } finally {
      await worker.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  }, 60_000)

  it("completes a 5xx failure when a later attempt succeeds", async () => {
    const queue = isolatedQueue()
    let attempts = 0
    const worker = new Worker(
      SEND_EMAIL_QUEUE_NAME,
      async () => {
        attempts += 1
        if (attempts === 1) {
          const cause = new Error("unavailable")
          cause.name = "InternalServerException"
          Object.assign(cause, { $metadata: { httpStatusCode: 503 } })
          const error = new Error("SES send failed", { cause })
          error.name = "MailTransportError"
          throw error
        }
      },
      {
        connection: redisOptions(redisUrl ?? ""),
        prefix,
        concurrency: 1,
      }
    )
    const finished = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("recovered job did not complete")),
        10_000
      )
      worker.on("completed", () => {
        clearTimeout(timer)
        resolve()
      })
    })
    try {
      await enqueueSendEmailJob(queue, `${SECOND_ID}-recover`)
      await finished
      expect(attempts).toBe(2)
    } finally {
      await worker.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  }, 15_000)

  it("pauses the shared queue on account pause and resumes later jobs", async () => {
    const queue = isolatedQueue()
    const options = redisOptions(redisUrl ?? "")
    let sends = 0
    const alerts: string[] = []
    const seen = new Set<string>()
    const processor = async (job: { data: { message_id: string } }) => {
      const messageId = job.data.message_id
      await processSendEmailJob({ message_id: messageId }, {
        load: async () => ({
          state: "queued",
          context: queuedContext(messageId),
        }),
        skipIfSendChecksFail: async () => null,
        markSent: async () => undefined,
        markFailed: async () => undefined,
        claim: async () => true,
        releaseClaim: async () => undefined,
        transport: {
          send: async () => {
            sends += 1
            if (!seen.has("paused")) {
              seen.add("paused")
              throw accountPausedError()
            }
            return { providerMessageId: `id-${messageId}` }
          },
        },
        pauseQueue: () => queue.pause(),
        openAccountPausedAlert: async () => {
          alerts.push(messageId)
        },
      } satisfies SendEmailJobDeps)
    }
    const first = new Worker(SEND_EMAIL_QUEUE_NAME, processor, {
      connection: options,
      prefix,
      concurrency: 1,
    })
    let second: Worker | undefined
    try {
      await enqueueSendEmailJob(queue, FIRST_ID)
      await enqueueSendEmailJob(queue, SECOND_ID)
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("queue did not pause")),
          5_000
        )
        const check = setInterval(() => {
          if (alerts.length > 0) {
            clearInterval(check)
            clearTimeout(timer)
            resolve()
          }
        }, 50)
      })
      expect(await queue.isPaused()).toBe(true)
      second = new Worker(SEND_EMAIL_QUEUE_NAME, processor, {
        connection: options,
        prefix,
        concurrency: 1,
      })
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(sends).toBe(1)
      const resumed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("paused jobs did not resume")),
          15_000
        )
        let completed = 0
        const onCompleted = () => {
          completed += 1
          if (completed === 2) {
            clearTimeout(timer)
            resolve()
          }
        }
        first.on("completed", onCompleted)
        second?.on("completed", onCompleted)
      })
      await queue.resume()
      await resumed
      expect(alerts.length).toBeGreaterThan(0)
      expect(sends).toBeGreaterThanOrEqual(2)
    } finally {
      await queue.resume().catch(() => undefined)
      await first.close()
      await second?.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  }, 25_000)
})

describe.skipIf(!templateName)("send-email delivery database", () => {
  const db = templateName
    ? getDb()
    : (undefined as unknown as ReturnType<typeof getDb>)

  async function deliver(
    messageId: string,
    transport: SendEmailJobDeps["transport"],
    markSent?: SendEmailJobDeps["markSent"]
  ): Promise<void> {
    await runSendEmailExclusive(db, messageId, async (tx) => {
      await processSendEmailJob(
        { message_id: messageId },
        {
          load: (id) => loadQueuedSend(tx, id),
          skipIfSendChecksFail: (context) =>
            skipQueuedMessageIfBlocked(tx, context),
          markSent:
            markSent ??
            ((id, sesMessageId, sentAt) =>
              markMessageSent(tx, id, sesMessageId, sentAt)),
          markFailed: (id, failureReason) =>
            markMessageFailed(tx, id, failureReason),
          claim: (id) => claimQueuedMessage(db, id),
          releaseClaim: (id) => releaseQueuedClaim(db, id),
          transport,
          pauseQueue: async () => undefined,
          openAccountPausedAlert: async () => undefined,
        }
      )
    })
  }

  it("sends a queued row once and stores the provider id", async () => {
    const person = await createRecipient(db, {
      email: `t046-active-${randomBytes(3).toString("hex")}@example.com`,
    })
    const from = await createSender(db, { fromName: "T046" })
    const created = await createTemplate(db, {
      emailType: "engagement",
      subject: "Queued subject",
      bodySource: "<p>Queued body</p>",
    })
    const queued = await createMessage(db, {
      recipientId: person.id,
      senderId: from.id,
      templateVersionId: created.version.id,
      emailType: "engagement",
      status: "queued",
    })
    const send = viSend()
    await deliver(queued.id, { send })
    await deliver(queued.id, { send }).catch(() => undefined)

    const saved = await findMessage(db, queued.id)
    expect(send).toHaveBeenCalledTimes(1)
    expect(saved?.status).toBe("sent")
    expect(saved?.sesMessageId).toBe("provider-1")
    expect(saved?.sentAt).toBeInstanceOf(Date)
  })

  it("does not send a skipped or failed row", async () => {
    const skipped = await createMessage(db, {
      emailType: "engagement",
      status: "skipped",
      skipReason: "suppressed",
    })
    const failed = await createMessage(db, {
      emailType: "engagement",
      status: "failed",
    })
    const send = viSend()
    await deliver(skipped.id, { send })
    await deliver(failed.id, { send })
    expect(send).not.toHaveBeenCalled()
  })

  it("skips a hard-bounced recipient and a suppression added after queueing", async () => {
    const bounced = await createRecipient(db, {
      email: `t046-bounced-${randomBytes(3).toString("hex")}@example.com`,
      status: "bounced",
    })
    const bouncedMessage = await createMessage(db, {
      recipientId: bounced.id,
      emailType: "engagement",
      status: "queued",
    })
    const send = viSend()
    await deliver(bouncedMessage.id, { send })
    const bouncedSaved = await findMessage(db, bouncedMessage.id)
    expect(bouncedSaved?.status).toBe("skipped")
    expect(bouncedSaved?.skipReason).toBe("recipient_bounced")

    const person = await createRecipient(db, {
      email: `t046-supp-${randomBytes(3).toString("hex")}@example.com`,
    })
    const suppressed = await createMessage(db, {
      recipientId: person.id,
      emailType: "engagement",
      status: "queued",
    })
    await db.insert(suppressionEntry).values({
      emailHash: person.emailHash,
      recipientId: person.id,
      scope: "global",
      source: "manual",
    })
    await deliver(suppressed.id, { send })
    const suppressedSaved = await findMessage(db, suppressed.id)
    expect(suppressedSaved?.status).toBe("skipped")
    expect(suppressedSaved?.skipReason).toBe("suppressed")
    expect(send).not.toHaveBeenCalled()
  })

  it("sends only once when two workers take the same queued message", async () => {
    const queued = await createMessage(db, {
      emailType: "engagement",
      status: "queued",
    })
    let sends = 0
    const transport = {
      send: async () => {
        sends += 1
        await new Promise((resolve) => setTimeout(resolve, 150))
        return { providerMessageId: "provider-once" }
      },
    }
    await Promise.all([
      deliver(queued.id, transport),
      deliver(queued.id, transport),
    ])
    const saved = await findMessage(db, queued.id)
    expect(sends).toBe(1)
    expect(saved?.status).toBe("sent")
    expect(saved?.sesMessageId).toBe("provider-once")
  })

  it("does not send again when the provider accepted and the status write did not commit", async () => {
    const queued = await createMessage(db, {
      emailType: "thank_you",
      status: "queued",
    })
    let sends = 0
    const transport = {
      send: async () => {
        sends += 1
        return { providerMessageId: "provider-crash" }
      },
    }
    await deliver(queued.id, transport, async () => {
      throw new Error("status update failed")
    }).catch(() => undefined)
    const claimed = await findMessage(db, queued.id)
    expect(claimed?.status).toBe("sending")
    expect(claimed?.sesMessageId).toBeNull()
    await deliver(queued.id, transport)
    const stillClaimed = await findMessage(db, queued.id)
    expect(sends).toBe(1)
    expect(stillClaimed?.status).toBe("sending")
  })

  it("marks a permanent SES rejection failed and does not retry", async () => {
    const queued = await createMessage(db, {
      emailType: "engagement",
      status: "queued",
    })
    const send = vi.fn(async () => {
      const cause = new Error("Email address is not verified")
      cause.name = "MessageRejected"
      Object.assign(cause, { $metadata: { httpStatusCode: 400 } })
      throw new MailTransportError("SES send failed", { cause })
    })
    await expect(deliver(queued.id, { send })).rejects.toBeInstanceOf(
      UnrecoverableError
    )
    const saved = await findMessage(db, queued.id)
    expect(saved?.status).toBe("failed")
    expect(saved?.failureReason).toContain("MessageRejected")
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("keeps the message queued and opens an alert when the SES account is paused", async () => {
    const queued = await createMessage(db, {
      emailType: "thank_you",
      status: "queued",
    })
    let paused = false
    await runSendEmailExclusive(db, queued.id, async (tx) => {
      await processSendEmailJob(
        { message_id: queued.id },
        {
          load: (id) => loadQueuedSend(tx, id),
          skipIfSendChecksFail: (context) =>
            skipQueuedMessageIfBlocked(tx, context),
          markSent: (id, sesMessageId, sentAt) =>
            markMessageSent(tx, id, sesMessageId, sentAt),
          markFailed: (id, failureReason) =>
            markMessageFailed(tx, id, failureReason),
          claim: (id) => claimQueuedMessage(db, id),
          releaseClaim: (id) => releaseQueuedClaim(db, id),
          transport: {
            send: async () => {
              throw accountPausedError()
            },
          },
          pauseQueue: async () => {
            paused = true
          },
          openAccountPausedAlert: () => openSesAccountPausedAlert(tx),
        }
      )
    }).catch(() => undefined)

    const saved = await findMessage(db, queued.id)
    const alerts = await findOpenAlerts(db, SES_ACCOUNT_PAUSED_DEDUPE_KEY)
    expect(paused).toBe(true)
    expect(saved?.status).toBe("queued")
    expect(saved?.sesMessageId).toBeNull()
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.type).toBe(SES_ACCOUNT_PAUSED_DEDUPE_KEY)
    expect(alerts[0]?.severity).toBe("critical")
  })
})

function viSend() {
  return vi.fn(async () => ({ providerMessageId: "provider-1" }))
}

describe.skipIf(!templateName)("send-email Mailpit delivery", () => {
  it("delivers the rendered message through SMTP and marks it sent", async () => {
    const info = await fetch("http://127.0.0.1:8025/api/v1/info", {
      signal: AbortSignal.timeout(2_000),
    }).catch(() => undefined)
    if (!info?.ok) {
      throw new Error("Mailpit is not reachable on 127.0.0.1:8025")
    }
    const db = getDb()
    const subject = `T046 ${randomBytes(4).toString("hex")}`
    const person = await createRecipient(db, {
      email: `t046-mailpit-${randomBytes(3).toString("hex")}@example.com`,
    })
    const from = await createSender(db, {
      fromName: "T046 Mailpit",
      fromEmail: `t046-${randomBytes(3).toString("hex")}@example.com`,
    })
    const created = await createTemplate(db, {
      emailType: "thank_you",
      subject,
      bodySource: "<p>Mailpit body</p>",
    })
    const queued = await createMessage(db, {
      recipientId: person.id,
      senderId: from.id,
      templateVersionId: created.version.id,
      emailType: "thank_you",
      status: "queued",
    })
    const transport = createMailTransport({
      MAIL_TRANSPORT: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
    })
    await runSendEmailExclusive(db, queued.id, async (tx) => {
      await processSendEmailJob(
        { message_id: queued.id },
        {
          load: (id) => loadQueuedSend(tx, id),
          skipIfSendChecksFail: (context) =>
            skipQueuedMessageIfBlocked(tx, context),
          markSent: (id, sesMessageId, sentAt) =>
            markMessageSent(tx, id, sesMessageId, sentAt),
          markFailed: (id, failureReason) =>
            markMessageFailed(tx, id, failureReason),
          claim: (id) => claimQueuedMessage(db, id),
          releaseClaim: (id) => releaseQueuedClaim(db, id),
          transport,
          pauseQueue: async () => undefined,
          openAccountPausedAlert: async () => undefined,
        }
      )
    })
    const saved = await findMessage(db, queued.id)
    expect(saved?.status).toBe("sent")
    expect(saved?.sesMessageId?.length).toBeGreaterThan(0)

    let mailpitId = ""
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const search = await fetch(
        `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`
      )
      const body = (await search.json()) as {
        messages?: { ID?: string; Subject?: string }[]
      }
      mailpitId =
        body.messages?.find((item) => item.Subject === subject)?.ID ?? ""
      if (mailpitId !== "") {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(mailpitId).not.toBe("")
    const stored = (await (
      await fetch(`http://127.0.0.1:8025/api/v1/message/${mailpitId}`)
    ).json()) as { Subject?: string; HTML?: string; Text?: string }
    expect(stored.Subject).toBe(subject)
    expect(stored.HTML).toContain("Mailpit body")
    expect(stored.Text).toContain("Mailpit body")
    await fetch("http://127.0.0.1:8025/api/v1/messages", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [mailpitId] }),
    }).catch(() => undefined)
  }, 20_000)
})
