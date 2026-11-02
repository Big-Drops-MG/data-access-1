import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Message, Recipient } from "@workspace/db"

import {
  claimQueuedMessage,
  loadQueuedSend,
  markMessageFailed,
  markMessageSent,
  openSesAccountPausedAlert,
  releaseQueuedClaim,
  runSendEmailExclusive,
  skipQueuedMessageIfBlocked,
  type QueuedSendContext,
} from "./send-email-delivery.js"
import type * as SendChecks from "./send-checks.js"
import { runSendChecks } from "./send-checks.js"

vi.mock("./send-checks.js", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SendChecks
  return {
    ...actual,
    runSendChecks: vi.fn(async () => null),
  }
})

const messageId = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"

const recipient = {
  id: "0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d45",
  email: "ada@example.com",
  emailHash: "hash",
  externalUserId: null,
  tier: "standard",
  tierUpdatedAt: new Date(),
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastEmailedAt: null,
} as Recipient

const queuedMessage = {
  id: messageId,
  status: "queued",
  templateVersionId: "0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d46",
  senderId: "0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d47",
  recipientId: recipient.id,
  offerId: null,
  emailType: "engagement",
} as Message

type Step = { value?: unknown; error?: unknown }

function chain(step: Step) {
  const query: Record<string, unknown> = {}
  const self = () => query
  for (const name of [
    "from",
    "where",
    "limit",
    "innerJoin",
    "set",
    "returning",
    "values",
  ]) {
    query[name] = vi.fn(self)
  }
  query.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown
  ) => {
    const promise = step.error
      ? Promise.reject(step.error)
      : Promise.resolve(step.value)
    return promise.then(resolve, reject)
  }
  return query
}

function fakeDb(steps: Step[]) {
  let index = 0
  const take = () => chain(steps[index++] ?? { value: [] })
  const db = {
    select: vi.fn(() => take()),
    update: vi.fn(() => take()),
    insert: vi.fn(() => take()),
    execute: vi.fn(async () => undefined),
    transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work(db)
    ),
  }
  return db
}

const context = {
  messageId,
  recipient,
  emailType: "engagement",
  offerId: null,
  categoryId: "0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d48",
  subject: "Hello",
  bodySource: "<p>Hi</p>",
  fromName: "Hub",
  fromEmail: "news@example.com",
  replyTo: null,
} as QueuedSendContext

describe("loadQueuedSend", () => {
  it("returns missing when the row is absent", async () => {
    const db = fakeDb([{ value: [] }])
    await expect(loadQueuedSend(db as never, messageId)).resolves.toEqual({
      state: "missing",
    })
  })

  it("returns not_queued when the row already left the queue", async () => {
    const db = fakeDb([{ value: [{ ...queuedMessage, status: "sent" }] }])
    await expect(loadQueuedSend(db as never, messageId)).resolves.toEqual({
      state: "not_queued",
    })
  })

  it("returns unsendable when the template or sender is missing", async () => {
    const db = fakeDb([
      { value: [{ ...queuedMessage, templateVersionId: null }] },
    ])
    await expect(loadQueuedSend(db as never, messageId)).resolves.toEqual({
      state: "unsendable",
      messageId,
      failureReason: "queued message is missing template, sender, or recipient",
    })
  })

  it("returns unsendable when a related row is missing", async () => {
    const db = fakeDb([
      { value: [queuedMessage] },
      { value: [] },
      { value: [] },
      { value: [] },
    ])
    await expect(loadQueuedSend(db as never, messageId)).resolves.toMatchObject(
      { state: "unsendable", messageId }
    )
  })

  it("returns the queued send context", async () => {
    const db = fakeDb([
      { value: [queuedMessage] },
      { value: [recipient] },
      {
        value: [
          {
            subject: "Hello",
            bodySource: "<p>Hi</p>",
            categoryId: context.categoryId,
          },
        ],
      },
      {
        value: [
          {
            fromName: "Hub",
            fromEmail: "news@example.com",
            replyTo: "reply@example.com",
          },
        ],
      },
    ])
    await expect(loadQueuedSend(db as never, messageId)).resolves.toMatchObject(
      {
        state: "queued",
        context: {
          messageId,
          subject: "Hello",
          fromEmail: "news@example.com",
          replyTo: "reply@example.com",
        },
      }
    )
  })
})

describe("queued send writes", () => {
  beforeEach(() => {
    vi.mocked(runSendChecks).mockReset()
    vi.mocked(runSendChecks).mockResolvedValue(null)
  })

  it("leaves a sendable message queued when checks pass", async () => {
    const db = fakeDb([])
    await expect(
      skipQueuedMessageIfBlocked(db as never, context)
    ).resolves.toBeNull()
    expect(db.update).not.toHaveBeenCalled()
  })

  it("skips a blocked message", async () => {
    vi.mocked(runSendChecks).mockResolvedValue("suppressed")
    const db = fakeDb([{ value: undefined }])
    await expect(
      skipQueuedMessageIfBlocked(db as never, context)
    ).resolves.toBe("suppressed")
    expect(db.update).toHaveBeenCalledOnce()
  })

  it("claims a queued row and reports when the claim is lost", async () => {
    const claimed = fakeDb([{ value: [{ id: messageId }] }])
    const lost = fakeDb([{ value: [] }])
    await expect(claimQueuedMessage(claimed as never, messageId)).resolves.toBe(
      true
    )
    await expect(claimQueuedMessage(lost as never, messageId)).resolves.toBe(
      false
    )
  })

  it("releases a claim and records sent or failed", async () => {
    const db = fakeDb([
      { value: undefined },
      { value: undefined },
      { value: undefined },
    ])
    await releaseQueuedClaim(db as never, messageId)
    await markMessageSent(db as never, messageId, "ses-1", new Date())
    await markMessageFailed(db as never, messageId, "rejected")
    expect(db.update).toHaveBeenCalledTimes(3)
  })
})

describe("runSendEmailExclusive", () => {
  it("runs the work after taking the advisory lock", async () => {
    const db = fakeDb([])
    const work = vi.fn(async () => undefined)
    await runSendEmailExclusive(db as never, messageId, work)
    expect(db.execute).toHaveBeenCalledOnce()
    expect(work).toHaveBeenCalledOnce()
  })

  it("commits the transaction and rethrows a JavaScript failure", async () => {
    const db = fakeDb([])
    await expect(
      runSendEmailExclusive(db as never, messageId, async () => {
        throw new Error("status update failed")
      })
    ).rejects.toThrow("status update failed")
  })
})

describe("openSesAccountPausedAlert", () => {
  it("bumps an alert that is already open", async () => {
    const db = fakeDb([{ value: [{ id: "alert-1" }] }])
    await openSesAccountPausedAlert(db as never)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it("inserts the alert when none is open", async () => {
    const db = fakeDb([{ value: [] }, { value: undefined }])
    await openSesAccountPausedAlert(db as never)
    expect(db.insert).toHaveBeenCalledOnce()
  })

  it("bumps again when the insert hits the unique open alert", async () => {
    const db = fakeDb([
      { value: [] },
      { error: { code: "23505" } },
      { value: undefined },
    ])
    await openSesAccountPausedAlert(db as never)
    expect(db.update).toHaveBeenCalledTimes(2)
  })

  it("treats a wrapped unique violation as the same alert", async () => {
    const db = fakeDb([
      { value: [] },
      { error: { cause: { code: "23505" } } },
      { value: undefined },
    ])
    await openSesAccountPausedAlert(db as never)
    expect(db.update).toHaveBeenCalledTimes(2)
  })

  it("rethrows a database error that is not a unique violation", async () => {
    const db = fakeDb([{ value: [] }, { error: new Error("db down") }])
    await expect(openSesAccountPausedAlert(db as never)).rejects.toThrow(
      "db down"
    )
  })

  it("rethrows a non-object failure", async () => {
    const db = fakeDb([{ value: [] }, { error: "nope" }])
    await expect(openSesAccountPausedAlert(db as never)).rejects.toBe("nope")
  })

  it("rethrows when a wrapped error is not a unique violation", async () => {
    const db = fakeDb([{ value: [] }, { error: { cause: null } }])
    await expect(openSesAccountPausedAlert(db as never)).rejects.toEqual({
      cause: null,
    })
  })
})
