import { randomBytes } from "node:crypto"

import {
  auditLog,
  feedbackItem,
  message,
  recipient,
  suppressionEntry,
} from "@workspace/db"
import { getDb } from "@workspace/db/client"
import {
  createMessage,
  createRecipient,
  createSender,
  createTemplate,
} from "@workspace/db/test"
import type { EventsJobData } from "@workspace/shared"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"

import { POST } from "@/app/api/ext/webhooks/ses/route"

import {
  createRedisSnsDedupe,
  handleSesWebhook,
  SesWebhookError,
  type SnsRedis,
} from "./ses-webhook.js"
import {
  sesNotificationMessage,
  signedSnsNotification,
  SNS_CERT_URL,
  SNS_TOPIC_ARN,
  snsTestCertificatePem,
} from "./ses-webhook-test-signature.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

describe.skipIf(!databaseUrl)("T-093 SES webhook", () => {
  const db = databaseUrl
    ? getDb()
    : (undefined as unknown as ReturnType<typeof getDb>)
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("accepts a signed delivery and stores delivered", async () => {
    const sent = await sentMessage()
    const harness = webhookHarness()
    await harness.post(notification("Delivery", sent.sesMessageId, sent.email))
    const saved = await reload(sent.id)
    expect(saved?.status).toBe("delivered")
    expect(harness.events).toHaveLength(1)
    expect(harness.events[0]?.records[0]?.ses_message_id).toBe(
      sent.sesMessageId
    )
    expect(harness.events[0]?.records[0]?.event_type).toBe("delivered")
  })

  it("rejects an invalid signature", async () => {
    const harness = webhookHarness()
    const body = signedSnsNotification({
      messageId: snsId(),
      message: sesNotificationMessage({
        eventType: "Delivery",
        sesMessageId: sesId(),
      }),
      signature: Buffer.from("not-a-valid-signature").toString("base64"),
    })
    await expect(harness.post(body)).rejects.toMatchObject({
      kind: "unauthorized",
      detail: "Signature",
    })
    expect(harness.events).toHaveLength(0)
  })

  it("rejects a missing signature", async () => {
    const harness = webhookHarness()
    const body = signedSnsNotification({
      messageId: snsId(),
      message: sesNotificationMessage({
        eventType: "Delivery",
        sesMessageId: sesId(),
      }),
      omitSignature: true,
    })
    await expect(harness.post(body)).rejects.toBeInstanceOf(SesWebhookError)
    await expect(harness.post(body)).rejects.toMatchObject({
      kind: "unauthorized",
      detail: "Signature",
    })
  })

  it("acknowledges an unknown SES message without creating a row", async () => {
    const harness = webhookHarness()
    const sesMessageId = sesId()
    await harness.post(notification("Delivery", sesMessageId))
    const rows = await db
      .select()
      .from(message)
      .where(eq(message.sesMessageId, sesMessageId))
    expect(rows).toHaveLength(0)
    expect(harness.events).toHaveLength(1)
  })

  it("leaves the message unchanged for an unknown event type", async () => {
    const sent = await sentMessage()
    const harness = webhookHarness()
    await harness.post(
      notification("NotARealSesEvent", sent.sesMessageId, sent.email)
    )
    expect((await reload(sent.id))?.status).toBe("sent")
    expect(harness.events).toHaveLength(0)
  })

  it("applies a duplicate delivery once", async () => {
    const sent = await sentMessage()
    const harness = webhookHarness()
    const body = notification("Delivery", sent.sesMessageId, sent.email)
    await harness.post(body)
    await harness.post(body)
    expect((await reload(sent.id))?.status).toBe("delivered")
    expect(harness.events).toHaveLength(1)
  })

  it("does not move a complained message back to delivered", async () => {
    const sent = await sentMessage()
    const harness = webhookHarness()
    await harness.post(notification("Complaint", sent.sesMessageId, sent.email))
    await harness.post(notification("Delivery", sent.sesMessageId, sent.email))
    expect((await reload(sent.id))?.status).toBe("complained")
  })

  it("records a hard bounce, suppression, and audit row", async () => {
    const sent = await sentMessage()
    const harness = webhookHarness()
    await harness.post(
      notification("Bounce", sent.sesMessageId, sent.email, "Permanent")
    )
    const saved = await reload(sent.id)
    const person = await db
      .select()
      .from(recipient)
      .where(eq(recipient.id, sent.recipientId))
      .limit(1)
    const suppressed = await db
      .select()
      .from(suppressionEntry)
      .where(eq(suppressionEntry.emailHash, sent.emailHash))
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, sent.recipientId))
    expect(saved?.status).toBe("bounced")
    expect(person[0]?.status).toBe("bounced")
    expect(suppressed.some((row) => row.source === "hard_bounce")).toBe(true)
    expect(audits.some((row) => row.action === "recipient.hard_bounce")).toBe(
      true
    )
    expect(harness.events[0]?.records[0]?.event_type).toBe("bounce_hard")
  })

  it("records a complaint without adding a suppression", async () => {
    const sent = await sentMessage()
    const harness = webhookHarness()
    await harness.post(notification("Complaint", sent.sesMessageId, sent.email))
    const saved = await reload(sent.id)
    const feedback = await db
      .select()
      .from(feedbackItem)
      .where(eq(feedbackItem.messageId, sent.id))
    const suppressed = await db
      .select()
      .from(suppressionEntry)
      .where(eq(suppressionEntry.emailHash, sent.emailHash))
    expect(saved?.status).toBe("complained")
    expect(feedback).toHaveLength(1)
    expect(feedback[0]?.source).toBe("provider_fbl")
    expect(feedback[0]?.status).toBe("pending")
    expect(suppressed).toHaveLength(0)
  })

  it("rejects a webhook route call with the wrong content type", async () => {
    const response = await POST(
      new Request("http://127.0.0.1/api/ext/webhooks/ses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    )
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthorized" },
    })
  })

  it("rejects a webhook route call with an invalid signature", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input) === SNS_CERT_URL) {
        return new Response(snsTestCertificatePem)
      }
      return new Response("missing", { status: 404 })
    }) as typeof fetch
    const response = await POST(
      new Request("http://127.0.0.1/api/ext/webhooks/ses", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: signedSnsNotification({
          messageId: snsId(),
          message: sesNotificationMessage({
            eventType: "Delivery",
            sesMessageId: sesId(),
          }),
          signature: Buffer.from("forged").toString("base64"),
        }),
      })
    )
    expect(response.status).toBe(401)
  })

  async function sentMessage(): Promise<{
    id: string
    sesMessageId: string
    email: string
    emailHash: string
    recipientId: string
  }> {
    const person = await createRecipient(db, {
      email: `t093-hook-${randomBytes(3).toString("hex")}@example.com`,
    })
    const from = await createSender(db, { fromName: "T093" })
    const created = await createTemplate(db, { emailType: "thank_you" })
    const sesMessageId = sesId()
    const row = await createMessage(db, {
      recipientId: person.id,
      senderId: from.id,
      templateVersionId: created.version.id,
      emailType: "thank_you",
      status: "sent",
    })
    await db
      .update(message)
      .set({ sesMessageId, sentAt: new Date() })
      .where(eq(message.id, row.id))
    return {
      id: row.id,
      sesMessageId,
      email: person.email,
      emailHash: person.emailHash,
      recipientId: person.id,
    }
  }

  async function reload(id: string) {
    const [row] = await db
      .select()
      .from(message)
      .where(eq(message.id, id))
      .limit(1)
    return row
  }
})

function webhookHarness(): {
  events: EventsJobData[]
  post: (body: string) => Promise<void>
} {
  const events: EventsJobData[] = []
  const dedupe = createRedisSnsDedupe(memoryRedis())
  return {
    events,
    post(body: string) {
      return handleSesWebhook(
        { contentType: "text/plain", body },
        {
          fetch: async (input) => {
            if (String(input) === SNS_CERT_URL) {
              return new Response(snsTestCertificatePem)
            }
            return new Response("missing", { status: 404 })
          },
          certificates: new Map(),
          dedupe,
          topicArn: SNS_TOPIC_ARN,
          enqueueEvents: async (data) => {
            events.push(data)
          },
        }
      )
    },
  }
}

function notification(
  eventType: string,
  sesMessageId: string,
  email?: string,
  bounceType?: string
): string {
  return signedSnsNotification({
    messageId: snsId(),
    message: sesNotificationMessage({
      eventType,
      sesMessageId,
      email,
      bounceType,
    }),
  })
}

function memoryRedis(): SnsRedis {
  const values = new Map<string, string>()
  return {
    async set(key, value, _expiryMode, _ttlSeconds, condition) {
      if (condition === "NX" && values.has(key)) return null
      values.set(key, value)
      return "OK"
    },
    async get(key) {
      return values.get(key) ?? null
    },
    async del(key) {
      return values.delete(key) ? 1 : 0
    },
  }
}

function snsId(): string {
  return `t093-${randomBytes(8).toString("hex")}`
}

function sesId(): string {
  return `0100018f${randomBytes(8).toString("hex")}-t093`
}
