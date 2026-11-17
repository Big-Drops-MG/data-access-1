import { randomBytes } from "node:crypto"

import { suppressionEntry } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import {
  createMessage,
  createRecipient,
  createSender,
  createTemplate,
  findMessage,
} from "@workspace/db/test"
import { MailTransportError, type RenderedMessage } from "@workspace/emails"
import {
  claimQueuedMessage,
  loadQueuedSend,
  markMessageFailed,
  markMessageSent,
  releaseQueuedClaim,
  runSendEmailExclusive,
  skipQueuedMessageIfBlocked,
} from "@workspace/shared"
import { UnrecoverableError } from "bullmq"
import { describe, expect, it } from "vitest"

import { processSendEmailJob, type SendEmailJobDeps } from "./send-email.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

const COMPLIANCE = {
  origin: "http://127.0.0.1:3000",
  secret: "t093-test-unsubscribe-secret",
}

describe.skipIf(!databaseUrl)("T-093 send-email worker", () => {
  const db = databaseUrl
    ? getDb()
    : (undefined as unknown as ReturnType<typeof getDb>)

  it("renders merge data and stores one provider id", async () => {
    const queued = await queuedThankYou({ first_name: "Ada" })
    const transport = recordingTransport("provider-ada")
    await deliver(queued.id, transport.send)
    await deliver(queued.id, transport.send)

    const saved = await findMessage(db, queued.id)
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.html).toContain("Hello Ada")
    expect(transport.calls[0]?.text).toContain("Hello Ada")
    expect(transport.calls[0]?.to).toBe(queued.email)
    expect(saved?.status).toBe("sent")
    expect(saved?.sesMessageId).toBe("provider-ada")
  }, 30_000)

  it("marks a permanent provider rejection failed and does not send again", async () => {
    const queued = await queuedThankYou({ first_name: "Bea" })
    const transport = recordingTransport(undefined, () => {
      const cause = new Error("address rejected")
      cause.name = "MessageRejected"
      throw new MailTransportError("SES send failed", { cause })
    })
    await expect(deliver(queued.id, transport.send)).rejects.toBeInstanceOf(
      UnrecoverableError
    )
    await deliver(queued.id, transport.send)

    const saved = await findMessage(db, queued.id)
    expect(transport.calls).toHaveLength(1)
    expect(saved?.status).toBe("failed")
    expect(saved?.failureReason).toContain("MessageRejected")
    expect(saved?.sesMessageId).toBeNull()
  })

  it("releases the claim after a retryable failure and sends on the next attempt", async () => {
    const queued = await queuedThankYou({ first_name: "Cara" })
    let attempt = 0
    const transport = recordingTransport(undefined, () => {
      attempt += 1
      if (attempt === 1) {
        const cause = new Error("unavailable")
        cause.name = "ServiceUnavailableException"
        Object.assign(cause, { $metadata: { httpStatusCode: 503 } })
        throw new MailTransportError("SES send failed", { cause })
      }
      return "provider-cara"
    })
    await expect(deliver(queued.id, transport.send)).rejects.toThrow(
      "SES send failed"
    )
    expect((await findMessage(db, queued.id))?.status).toBe("queued")
    await deliver(queued.id, transport.send)
    const saved = await findMessage(db, queued.id)
    expect(transport.calls).toHaveLength(2)
    expect(saved?.status).toBe("sent")
    expect(saved?.sesMessageId).toBe("provider-cara")
  })

  it("sends once when two workers process the same queued message", async () => {
    const queued = await queuedThankYou({ first_name: "Dina" })
    const transport = recordingTransport("provider-dina")
    await Promise.all([
      deliver(queued.id, transport.send),
      deliver(queued.id, transport.send),
    ])
    const saved = await findMessage(db, queued.id)
    expect(transport.calls).toHaveLength(1)
    expect(saved?.status).toBe("sent")
    expect(saved?.sesMessageId).toBe("provider-dina")
  })

  it("skips a recipient suppressed after the message was queued", async () => {
    const queued = await queuedThankYou({ first_name: "Eve" })
    await db.insert(suppressionEntry).values({
      emailHash: queued.emailHash,
      recipientId: queued.recipientId,
      scope: "global",
      source: "hard_bounce",
      reason: "t093-after-queue",
    })
    const transport = recordingTransport("should-not-send")
    await deliver(queued.id, transport.send)
    const saved = await findMessage(db, queued.id)
    expect(transport.calls).toHaveLength(0)
    expect(saved?.status).toBe("skipped")
    expect(saved?.skipReason).toBe("suppressed")
  })

  it("fails a queued message when the provider returns an empty id", async () => {
    const queued = await queuedThankYou({ first_name: "Fay" })
    const transport = recordingTransport("")
    await expect(deliver(queued.id, transport.send)).rejects.toThrow(
      /message id/i
    )
    const saved = await findMessage(db, queued.id)
    expect(transport.calls).toHaveLength(1)
    expect(saved?.status).toBe("failed")
    expect(saved?.sesMessageId ?? null).toBeNull()
    expect(saved?.failureReason ?? "").toMatch(/message id/i)
  })

  async function queuedThankYou(mergeData: Record<string, string>): Promise<{
    id: string
    email: string
    emailHash: string
    recipientId: string
  }> {
    const person = await createRecipient(db, {
      email: `t093-worker-${randomBytes(3).toString("hex")}@example.com`,
    })
    const from = await createSender(db, { fromName: "T093" })
    const created = await createTemplate(db, {
      emailType: "thank_you",
      subject: "Hello {{first_name}}",
      bodySource: "<p>Hello {{first_name}}</p>",
    })
    const queued = await createMessage(db, {
      recipientId: person.id,
      senderId: from.id,
      templateVersionId: created.version.id,
      emailType: "thank_you",
      status: "queued",
      mergeData,
    })
    return {
      id: queued.id,
      email: person.email,
      emailHash: person.emailHash,
      recipientId: person.id,
    }
  }

  async function deliver(
    messageId: string,
    send: SendEmailJobDeps["transport"]["send"]
  ): Promise<void> {
    await runSendEmailExclusive(db, messageId, async (tx) => {
      await processSendEmailJob(
        { message_id: messageId },
        {
          load: (id) => loadQueuedSend(tx, id),
          compliance: COMPLIANCE,
          skipIfSendChecksFail: (context) =>
            skipQueuedMessageIfBlocked(tx, context),
          markSent: (id, sesMessageId, sentAt) =>
            markMessageSent(tx, id, sesMessageId, sentAt),
          markFailed: (id, failureReason) =>
            markMessageFailed(tx, id, failureReason),
          claim: (id) => claimQueuedMessage(db, id),
          releaseClaim: (id) => releaseQueuedClaim(db, id),
          transport: { send },
          pauseQueue: async () => undefined,
          openAccountPausedAlert: async () => undefined,
        }
      )
    })
  }
})

function recordingTransport(
  providerMessageId: string | undefined,
  respond?: () => string
): { calls: RenderedMessage[]; send: SendEmailJobDeps["transport"]["send"] } {
  const calls: RenderedMessage[] = []
  return {
    calls,
    async send(message) {
      calls.push(message)
      const id = respond ? respond() : providerMessageId
      if (id === undefined) {
        throw new Error("transport response was not configured")
      }
      return { providerMessageId: id }
    },
  }
}
