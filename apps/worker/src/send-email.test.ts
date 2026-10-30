import type { Recipient } from "@workspace/db"
import { MailTransportError, createSmtpTransport } from "@workspace/emails"
import type { SendCheckSkipReason } from "@workspace/shared"
import { UnrecoverableError } from "bullmq"
import { describe, expect, it, vi } from "vitest"

import {
  classifySendFailure,
  processSendEmailJob,
  renderQueuedEmail,
  SEND_EMAIL_WORKER_CONCURRENCY,
  sendEmailWorkerOptions,
  type QueuedSendContext,
  type SendEmailJobDeps,
} from "./send-email.js"

const MESSAGE_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"

function recipient(): Recipient {
  const now = new Date("2026-10-30T12:00:00.000Z")
  return {
    id: "01900000-0000-7000-8000-000000000047",
    email: "ada@example.com",
    emailHash: "hash",
    externalUserId: null,
    tier: "standard",
    tierUpdatedAt: now,
    status: "active",
    createdAt: now,
    updatedAt: now,
    lastEmailedAt: null,
  }
}

function queuedContext(): QueuedSendContext {
  return {
    messageId: MESSAGE_ID,
    recipient: recipient(),
    emailType: "engagement",
    offerId: null,
    categoryId: "01900000-0000-7000-8000-000000000048",
    subject: "Hello",
    bodySource: "<p>Hi Ada</p>",
    fromName: "Big Drops",
    fromEmail: "news@example.com",
    replyTo: "reply@example.com",
  }
}

function sesError(
  name: string,
  statusCode: number,
  message = name
): MailTransportError {
  const cause = new Error(message)
  cause.name = name
  Object.assign(cause, { $metadata: { httpStatusCode: statusCode } })
  return new MailTransportError("SES send failed", { cause })
}

function deps(overrides: Partial<SendEmailJobDeps> = {}) {
  const send = vi.fn(async () => ({ providerMessageId: "ses-1" }))
  const markSent = vi.fn(async () => undefined)
  const markFailed = vi.fn(async () => undefined)
  const pauseQueue = vi.fn(async () => undefined)
  const openAccountPausedAlert = vi.fn(async () => undefined)
  const claim = vi.fn(async () => true)
  const releaseClaim = vi.fn(async () => undefined)
  const skipIfSendChecksFail = vi.fn(
    async (): Promise<SendCheckSkipReason | null> => null
  )
  const load = vi.fn(async () => ({
    state: "queued" as const,
    context: queuedContext(),
  }))

  return {
    load,
    transport: { send },
    ...overrides,
    send,
    markSent,
    markFailed,
    pauseQueue,
    openAccountPausedAlert,
    claim,
    releaseClaim,
    skipIfSendChecksFail,
  }
}

describe("send-email worker options", () => {
  it("limits SES to SES_MAX_SEND_RATE per second at concurrency 10", () => {
    expect(
      sendEmailWorkerOptions({
        MAIL_TRANSPORT: "ses",
        SES_MAX_SEND_RATE: "14",
      })
    ).toEqual({
      concurrency: SEND_EMAIL_WORKER_CONCURRENCY,
      limiter: { max: 14, duration: 1_000 },
    })
    expect(SEND_EMAIL_WORKER_CONCURRENCY).toBe(10)
  })

  it("omits the limiter for SMTP", () => {
    expect(
      sendEmailWorkerOptions({
        MAIL_TRANSPORT: "smtp",
      })
    ).toEqual({ concurrency: 10 })
  })
})

describe("renderQueuedEmail", () => {
  it("builds the sender, subject, and plain text from the pinned template", () => {
    expect(renderQueuedEmail(queuedContext())).toEqual({
      from: '"Big Drops" <news@example.com>',
      to: "ada@example.com",
      replyTo: "reply@example.com",
      subject: "Hello",
      html: "<p>Hi Ada</p>",
      text: "Hi Ada",
    })
  })

  it("leaves merge tags unchanged and does not add an unsubscribe URL", () => {
    const rendered = renderQueuedEmail({
      ...queuedContext(),
      bodySource: "<p>Hello {{first_name}}</p>",
      subject: "Hi {{first_name}}",
    })
    expect(rendered.subject).toBe("Hi {{first_name}}")
    expect(rendered.html).toBe("<p>Hello {{first_name}}</p>")
    expect(rendered.text).toBe("Hello {{first_name}}")
    expect(rendered).not.toHaveProperty("unsubscribeUrl")
  })

  it("quotes a display name and omits a blank reply-to", () => {
    const rendered = renderQueuedEmail({
      ...queuedContext(),
      fromName: 'Acme "Mail"',
      replyTo: "  ",
      bodySource: "Plain body",
    })
    expect(rendered.from).toBe('"Acme \\"Mail\\"" <news@example.com>')
    expect(rendered.replyTo).toBeUndefined()
    expect(rendered.text).toBe("Plain body")
  })
})

describe("classifySendFailure", () => {
  it("retries throttling and 5xx", () => {
    expect(classifySendFailure(sesError("ThrottlingException", 429))).toBe(
      "retry"
    )
    expect(
      classifySendFailure(
        sesError("InternalServerException", 500, "unavailable")
      )
    ).toBe("retry")
    expect(classifySendFailure(new Error("socket hang up"))).toBe("retry")
  })

  it("rejects MessageRejected and local transport errors", () => {
    expect(classifySendFailure(sesError("MessageRejected", 400))).toBe(
      "rejected"
    )
    expect(
      classifySendFailure(
        new MailTransportError("html and text bodies are required")
      )
    ).toBe("rejected")
  })

  it("rejects other permanent 4xx responses", () => {
    expect(
      classifySendFailure(sesError("MailFromDomainNotVerifiedException", 400))
    ).toBe("rejected")
  })

  it("treats account pause separately from other 4xx", () => {
    expect(
      classifySendFailure(sesError("AccountSendingPausedException", 400))
    ).toBe("account_paused")
  })
})

describe("processSendEmailJob", () => {
  it("sends a queued message and stores sent with ses_message_id", async () => {
    const jobDeps = deps()
    await processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)

    expect(jobDeps.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Hello",
        html: "<p>Hi Ada</p>",
        text: "Hi Ada",
      })
    )
    expect(jobDeps.markSent).toHaveBeenCalledWith(
      MESSAGE_ID,
      "ses-1",
      expect.any(Date)
    )
    expect(jobDeps.markFailed).not.toHaveBeenCalled()
    expect(jobDeps.releaseClaim).not.toHaveBeenCalled()
  })

  it("does not send when the queued claim was already taken", async () => {
    const jobDeps = deps()
    jobDeps.claim.mockResolvedValue(false)
    await processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    expect(jobDeps.send).not.toHaveBeenCalled()
  })

  it("does not send when the message is no longer queued", async () => {
    const jobDeps = deps({
      load: vi.fn(async () => ({ state: "not_queued" as const })),
    })
    await processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    expect(jobDeps.send).not.toHaveBeenCalled()
    expect(jobDeps.skipIfSendChecksFail).not.toHaveBeenCalled()
  })

  it("skips a suppressed message without sending", async () => {
    const jobDeps = deps()
    jobDeps.skipIfSendChecksFail.mockResolvedValue("suppressed")

    await processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)

    expect(jobDeps.skipIfSendChecksFail).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: MESSAGE_ID })
    )
    expect(jobDeps.send).not.toHaveBeenCalled()
    expect(jobDeps.claim).not.toHaveBeenCalled()
  })

  it("does not hand an empty body to the SMTP sender", async () => {
    const sendMail = vi.fn()
    const jobDeps = deps({
      load: vi.fn(async () => ({
        state: "queued" as const,
        context: { ...queuedContext(), bodySource: "   " },
      })),
      transport: createSmtpTransport({
        host: "127.0.0.1",
        port: 1025,
        sender: { sendMail },
      }),
    })

    await expect(
      processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(sendMail).not.toHaveBeenCalled()
    expect(jobDeps.markFailed).toHaveBeenCalled()
  })

  it("retries a 5xx response and releases the claim", async () => {
    const error = sesError("InternalServerException", 503, "unavailable")
    const jobDeps = deps({
      transport: { send: vi.fn(async () => Promise.reject(error)) },
    })

    await expect(
      processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    ).rejects.toBe(error)
    expect(jobDeps.markFailed).not.toHaveBeenCalled()
    expect(jobDeps.markSent).not.toHaveBeenCalled()
    expect(jobDeps.releaseClaim).toHaveBeenCalledWith(MESSAGE_ID)
  })

  it("retries throttling and releases the claim", async () => {
    const error = sesError("ThrottlingException", 429)
    const jobDeps = deps({
      transport: { send: vi.fn(async () => Promise.reject(error)) },
    })

    await expect(
      processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    ).rejects.toBe(error)
    expect(jobDeps.markFailed).not.toHaveBeenCalled()
    expect(jobDeps.pauseQueue).not.toHaveBeenCalled()
    expect(jobDeps.releaseClaim).toHaveBeenCalledWith(MESSAGE_ID)
  })

  it("keeps the claim when the provider accepted and saving the id fails", async () => {
    const jobDeps = deps()
    jobDeps.markSent.mockRejectedValue(new Error("status update failed"))

    await expect(
      processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    ).rejects.toThrow("status update failed")
    expect(jobDeps.send).toHaveBeenCalledTimes(1)
    expect(jobDeps.releaseClaim).not.toHaveBeenCalled()
    expect(jobDeps.markFailed).not.toHaveBeenCalled()
  })

  it("marks a rejected send failed and does not retry", async () => {
    const jobDeps = deps({
      transport: {
        send: vi.fn(async () =>
          Promise.reject(
            sesError("MessageRejected", 400, "Address blacklisted")
          )
        ),
      },
    })

    await expect(
      processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(jobDeps.markFailed).toHaveBeenCalledWith(
      MESSAGE_ID,
      expect.stringContaining("MessageRejected")
    )
    expect(jobDeps.pauseQueue).not.toHaveBeenCalled()
  })

  it("pauses the queue and alerts when the account is paused", async () => {
    const error = sesError("AccountSendingPausedException", 400)
    const jobDeps = deps({
      transport: { send: vi.fn(async () => Promise.reject(error)) },
    })

    await expect(
      processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    ).rejects.toBe(error)
    expect(jobDeps.pauseQueue).toHaveBeenCalledOnce()
    expect(jobDeps.openAccountPausedAlert).toHaveBeenCalledOnce()
    expect(jobDeps.markFailed).not.toHaveBeenCalled()
    expect(jobDeps.releaseClaim).toHaveBeenCalledWith(MESSAGE_ID)
  })

  it("fails a queued message that is missing its template or sender", async () => {
    const jobDeps = deps({
      load: vi.fn(async () => ({
        state: "unsendable" as const,
        messageId: MESSAGE_ID,
        failureReason:
          "queued message is missing template, sender, or recipient",
      })),
    })

    await expect(
      processSendEmailJob({ message_id: MESSAGE_ID }, jobDeps)
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(jobDeps.markFailed).toHaveBeenCalledWith(
      MESSAGE_ID,
      "queued message is missing template, sender, or recipient"
    )
    expect(jobDeps.send).not.toHaveBeenCalled()
  })
})
