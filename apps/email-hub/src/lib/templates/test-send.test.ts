import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Message } from "@workspace/db"
import type * as SharedModule from "@workspace/shared"

const triggerEmail = vi.hoisted(() => vi.fn())
const getDb = vi.hoisted(() => vi.fn())
const getSendEmailQueue = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return {
    ...actual,
    triggerEmail,
  }
})

vi.mock("@workspace/db/client", () => ({ getDb }))
vi.mock("@/lib/ext-emails/queue", () => ({ getSendEmailQueue }))

import { sendTemplateTest } from "./test-send"

const templateId = "019a0000-0000-7000-8000-0000000000aa"
const versionId = "019a0000-0000-7000-8000-0000000000bb"
const messageId = "019a0000-0000-7000-8000-0000000000cc"
const userId = "019a0000-0000-7000-8000-000000000001"

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of ["from", "innerJoin", "where", "limit"]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

function message(
  status: Message["status"],
  skipReason: Message["skipReason"] = null
): Message {
  return { id: messageId, status, skipReason } as Message
}

describe("sendTemplateTest", () => {
  beforeEach(() => {
    triggerEmail.mockReset()
    getDb.mockReset()
    getSendEmailQueue.mockReset()
    getSendEmailQueue.mockReturnValue({ add: vi.fn() })
  })

  it("rejects a session without an email", async () => {
    await expect(
      sendTemplateTest(
        {
          templateId,
          versionId,
          offerId: null,
          email: "not-an-email",
        },
        { userId }
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [{ path: "email" }],
    })
    expect(getDb).not.toHaveBeenCalled()
  })

  it("returns 404 when the template or version is missing", async () => {
    getDb.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([])),
    })
    await expect(
      sendTemplateTest(
        {
          templateId,
          versionId,
          offerId: null,
          email: "ada@example.com",
        },
        { userId }
      )
    ).rejects.toMatchObject({
      code: "not_found",
      details: [{ path: "id" }],
    })

    getDb.mockReturnValue({
      select: vi
        .fn()
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(query([{ id: templateId }])),
    })
    await expect(
      sendTemplateTest(
        {
          templateId,
          versionId,
          offerId: null,
          email: "ada@example.com",
        },
        { userId }
      )
    ).rejects.toMatchObject({
      details: [{ path: "version_id" }],
    })
  })

  it("rejects an archived template", async () => {
    getDb.mockReturnValue({
      select: vi.fn(() =>
        query([
          {
            id: templateId,
            emailType: "thank_you",
            status: "archived",
            versionId,
          },
        ])
      ),
    })
    await expect(
      sendTemplateTest(
        {
          templateId,
          versionId,
          offerId: null,
          email: "ada@example.com",
        },
        { userId }
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
    expect(triggerEmail).not.toHaveBeenCalled()
  })

  it("queues a test message to the session email", async () => {
    getDb.mockReturnValue({
      select: vi.fn(() =>
        query([
          {
            id: templateId,
            emailType: "engagement",
            status: "draft",
            versionId,
          },
        ])
      ),
    })
    triggerEmail.mockResolvedValue({
      message: message("queued"),
      created: true,
      recipient: {},
    })

    const result = await sendTemplateTest(
      {
        templateId,
        versionId,
        offerId: null,
        idempotencyKey: " once ",
        mergeData: { first_name: "Ada" },
        email: "Ada@Example.com",
      },
      { userId, requestId: "req-1" }
    )

    expect(result).toEqual({
      message_id: messageId,
      status: "queued",
      environment: "test",
      httpStatus: 202,
    })
    expect(triggerEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email: "ada@example.com",
        emailType: "engagement",
        environment: "test",
        templateVersionId: versionId,
        idempotencyKey: `test:${userId}:once`,
      }),
      expect.objectContaining({ enqueueSendEmail: expect.any(Function) })
    )
  })

  it("returns 200 when the idempotency key replays a queued row", async () => {
    getDb.mockReturnValue({
      select: vi.fn(() =>
        query([
          {
            id: templateId,
            emailType: "thank_you",
            status: "active",
            versionId,
          },
        ])
      ),
    })
    triggerEmail.mockResolvedValue({
      message: message("queued"),
      created: false,
      recipient: {},
    })
    const result = await sendTemplateTest(
      {
        templateId,
        versionId,
        offerId: null,
        email: "ada@example.com",
      },
      { userId }
    )
    expect(result.httpStatus).toBe(200)
  })

  it("maps skipped and non-queued messages to 409", async () => {
    getDb.mockReturnValue({
      select: vi.fn(() =>
        query([
          {
            id: templateId,
            emailType: "thank_you",
            status: "active",
            versionId,
          },
        ])
      ),
    })
    triggerEmail.mockResolvedValueOnce({
      message: message("skipped", "no_route"),
      created: true,
      recipient: {},
    })
    await expect(
      sendTemplateTest(
        {
          templateId,
          versionId,
          offerId: null,
          email: "ada@example.com",
        },
        { userId }
      )
    ).rejects.toMatchObject({
      code: "conflict",
      details: [{ path: "route", message: "no_route" }],
    })

    triggerEmail.mockResolvedValueOnce({
      message: message("skipped", "suppressed"),
      created: true,
      recipient: {},
    })
    await expect(
      sendTemplateTest(
        {
          templateId,
          versionId,
          offerId: null,
          email: "ada@example.com",
        },
        { userId }
      )
    ).rejects.toMatchObject({
      details: [{ path: "send_check", message: "suppressed" }],
    })

    triggerEmail.mockResolvedValueOnce({
      message: message("skipped", null),
      created: true,
      recipient: {},
    })
    await expect(
      sendTemplateTest(
        {
          templateId,
          versionId,
          offerId: null,
          email: "ada@example.com",
        },
        { userId }
      )
    ).rejects.toMatchObject({
      details: [{ path: "send_check", message: "skipped" }],
    })

    triggerEmail.mockResolvedValueOnce({
      message: message("sent"),
      created: true,
      recipient: {},
    })
    await expect(
      sendTemplateTest(
        {
          templateId,
          versionId,
          offerId: null,
          email: "ada@example.com",
        },
        { userId }
      )
    ).rejects.toMatchObject({
      details: [{ path: "status", message: "sent" }],
    })
  })
})
