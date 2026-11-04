import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Message } from "@workspace/db"
import type * as SharedModule from "@workspace/shared"
import { AppError } from "@workspace/shared"

const triggerEmail = vi.hoisted(() => vi.fn())
const enqueueSendEmailJob = vi.hoisted(() => vi.fn())
const getSendEmailQueue = vi.hoisted(() => vi.fn())
const getDb = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return {
    ...actual,
    triggerEmail,
    enqueueSendEmailJob,
  }
})

vi.mock("@workspace/db/client", () => ({ getDb }))
vi.mock("@/lib/ext-emails/queue", () => ({ getSendEmailQueue }))

import { getExternalEmailStatus, submitExternalEmail } from "./service"

const CLIENT_ID = "019a0000-0000-7000-8000-0000000000aa"
const MESSAGE_ID = "019a0000-0000-7000-8000-0000000000bb"

function message(status: Message["status"]): Message {
  return {
    id: MESSAGE_ID,
    status,
    idempotencyKey: `ext:${CLIENT_ID}:order-1`,
  } as Message
}

function input() {
  return {
    apiClientId: CLIENT_ID,
    to: "person@example.com",
    emailType: "thank_you" as const,
    idempotencyKey: "order-1",
    offerId: null,
    externalUserId: null,
  }
}

describe("submitExternalEmail", () => {
  beforeEach(() => {
    triggerEmail.mockReset()
    enqueueSendEmailJob.mockReset()
    getSendEmailQueue.mockReset()
    getSendEmailQueue.mockReturnValue({ name: "send-email" })
    getDb.mockReset()
    enqueueSendEmailJob.mockResolvedValue(undefined)
  })

  it("queues a new message and returns 202", async () => {
    triggerEmail.mockImplementation(async (_db, _input, deps) => {
      await deps.enqueueSendEmail(MESSAGE_ID)
      return { message: message("queued"), created: true, recipient: {} }
    })

    const result = await submitExternalEmail(input())

    expect(result).toEqual({
      httpStatus: 202,
      body: { message_id: MESSAGE_ID, status: "queued" },
    })
    expect(triggerEmail).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        email: "person@example.com",
        idempotencyKey: `ext:${CLIENT_ID}:order-1`,
        emailType: "thank_you",
      }),
      expect.any(Object)
    )
    expect(enqueueSendEmailJob).toHaveBeenCalledTimes(1)
  })

  it("returns 200 for a skipped message without enqueueing", async () => {
    triggerEmail.mockResolvedValue({
      message: message("skipped"),
      created: true,
      recipient: {},
    })

    const result = await submitExternalEmail(input())

    expect(result.httpStatus).toBe(200)
    expect(result.body.status).toBe("skipped")
    expect(enqueueSendEmailJob).not.toHaveBeenCalled()
  })

  it("returns 200 and enqueues again when a queued replay has no job", async () => {
    triggerEmail.mockResolvedValue({
      message: message("queued"),
      created: false,
      recipient: {},
    })

    const result = await submitExternalEmail(input())

    expect(result.httpStatus).toBe(200)
    expect(enqueueSendEmailJob).toHaveBeenCalledWith(
      { name: "send-email" },
      MESSAGE_ID,
      undefined
    )
  })

  it("treats an existing send job as success", async () => {
    triggerEmail.mockResolvedValue({
      message: message("queued"),
      created: false,
      recipient: {},
    })
    enqueueSendEmailJob.mockRejectedValue(new Error("Job already exists"))

    await expect(submitExternalEmail(input())).resolves.toMatchObject({
      httpStatus: 200,
    })
  })

  it("returns 503 when the queue rejects a new send", async () => {
    enqueueSendEmailJob.mockRejectedValue(new Error("redis down"))
    triggerEmail.mockImplementation(async (_db, _input, deps) => {
      try {
        await deps.enqueueSendEmail(MESSAGE_ID)
      } catch {
        // Match triggerEmail: keep the row queued when enqueue fails.
      }
      return { message: message("queued"), created: true, recipient: {} }
    })

    await expect(submitExternalEmail(input())).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    })
  })

  it("returns the existing row after a unique idempotency race", async () => {
    triggerEmail.mockRejectedValue({ code: "23505" })
    const limit = vi.fn().mockResolvedValue([message("sent")])
    const where = vi.fn(() => ({ limit }))
    const from = vi.fn(() => ({ where }))
    getDb.mockReturnValue({
      select: () => ({ from }),
    })

    const result = await submitExternalEmail(input())

    expect(result).toEqual({
      httpStatus: 200,
      body: { message_id: MESSAGE_ID, status: "sent" },
    })
    expect(enqueueSendEmailJob).not.toHaveBeenCalled()
  })

  it("does not create a message when the queue client is unavailable", async () => {
    getSendEmailQueue.mockImplementation(() => {
      throw AppError.unavailable([
        { path: "queue", message: "Send queue unavailable" },
      ])
    })

    await expect(submitExternalEmail(input())).rejects.toMatchObject({
      status: 503,
    })
    expect(triggerEmail).not.toHaveBeenCalled()
  })
})

describe("getExternalEmailStatus", () => {
  beforeEach(() => {
    getDb.mockReset()
  })

  it("returns the persisted status", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([{ id: MESSAGE_ID, status: "delivered" }])
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit }),
        }),
      }),
    })

    await expect(
      getExternalEmailStatus(MESSAGE_ID, CLIENT_ID)
    ).resolves.toEqual({
      message_id: MESSAGE_ID,
      status: "delivered",
    })
  })

  it("returns 404 when the message is missing", async () => {
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    })

    await expect(
      getExternalEmailStatus(MESSAGE_ID, CLIENT_ID)
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    })
  })
})
