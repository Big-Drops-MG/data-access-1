import type { Send } from "@workspace/db"
import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { processDispatchSendJob } from "./dispatch-send.js"

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
  maskEmail: (email: string) => email,
}))

const SEND_ID = "01900000-0000-7000-8000-000000000400"
const RECIPIENT_A = "01900000-0000-7000-8000-000000000401"
const RECIPIENT_B = "01900000-0000-7000-8000-000000000402"

function sendRow(overrides: Partial<Send> = {}): Send {
  const now = new Date("2026-11-05T12:00:00.000Z")
  return {
    id: SEND_ID,
    emailType: "engagement",
    templateVersionId: "01900000-0000-7000-8000-000000000410",
    senderId: "01900000-0000-7000-8000-000000000411",
    offerId: "01900000-0000-7000-8000-000000000412",
    categoryId: "01900000-0000-7000-8000-000000000413",
    scheduledFor: new Date("2026-11-05T11:50:00.000Z"),
    status: "scheduled",
    dispatchStartedAt: null,
    completedAt: null,
    version: 2,
    createdBy: "01900000-0000-7000-8000-000000000499",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("processDispatchSendJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects an invalid send_id without retry", async () => {
    await expect(
      processDispatchSendJob(
        { send_id: "not-a-uuid" },
        {
          db: {} as never,
          enqueueSendEmail: vi.fn(),
        }
      )
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it("pages recipients, triggers with send_id:recipient_id, then completes", async () => {
    const scheduled = sendRow()
    const dispatching = sendRow({
      status: "dispatching",
      dispatchStartedAt: new Date("2026-11-05T12:00:00.000Z"),
    })
    const completed = sendRow({
      status: "completed",
      completedAt: new Date("2026-11-05T12:01:00.000Z"),
    })

    let selectCalls = 0
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              selectCalls += 1
              if (selectCalls === 1) {
                return Promise.resolve([scheduled])
              }
              return Promise.resolve([{ status: "dispatching" }])
            },
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => {
              if (selectCalls <= 2) {
                return Promise.resolve([dispatching])
              }
              return Promise.resolve([completed])
            },
          }),
        }),
      }),
    }

    const trigger = vi.fn(async () => ({
      created: true,
      message: { id: "msg" },
      recipient: { id: RECIPIENT_A },
    }))
    const loadRecipientPage = vi
      .fn()
      .mockResolvedValueOnce([
        { id: RECIPIENT_A, email: "a@example.com" },
        { id: RECIPIENT_B, email: "b@example.com" },
      ])
      .mockResolvedValueOnce([])

    await processDispatchSendJob(
      { send_id: SEND_ID },
      {
        db: db as never,
        enqueueSendEmail: vi.fn(),
        loadRecipientPage,
        trigger: trigger as never,
        openLateAlert: vi.fn(async () => undefined),
        now: () => new Date("2026-11-05T12:00:00.000Z"),
      }
    )

    expect(trigger).toHaveBeenCalledTimes(2)
    expect(trigger).toHaveBeenNthCalledWith(
      1,
      db,
      expect.objectContaining({
        email: "a@example.com",
        idempotencyKey: `${SEND_ID}:${RECIPIENT_A}`,
        sendId: SEND_ID,
        senderId: scheduled.senderId,
        templateVersionId: scheduled.templateVersionId,
        offerId: scheduled.offerId,
        emailType: "engagement",
      }),
      expect.objectContaining({ enqueueSendEmail: expect.any(Function) })
    )
    expect(loadRecipientPage).toHaveBeenCalled()
  })

  it("stops when the send is cancelled between batches", async () => {
    const dispatching = sendRow({ status: "dispatching" })
    let selectCalls = 0
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              selectCalls += 1
              if (selectCalls === 1) {
                return Promise.resolve([dispatching])
              }
              return Promise.resolve([{ status: "cancelled" }])
            },
          }),
        }),
      }),
      update: vi.fn(),
    }

    const trigger = vi.fn()
    const loadRecipientPage = vi.fn()

    await processDispatchSendJob(
      { send_id: SEND_ID },
      {
        db: db as never,
        enqueueSendEmail: vi.fn(),
        loadRecipientPage,
        trigger: trigger as never,
        openLateAlert: vi.fn(async () => undefined),
      }
    )

    expect(trigger).not.toHaveBeenCalled()
    expect(loadRecipientPage).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
  })

  it("is a no-op for already completed sends", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([sendRow({ status: "completed" })]),
          }),
        }),
      }),
      update: vi.fn(),
    }

    await processDispatchSendJob(
      { send_id: SEND_ID },
      {
        db: db as never,
        enqueueSendEmail: vi.fn(),
        loadRecipientPage: vi.fn(),
        trigger: vi.fn() as never,
      }
    )

    expect(db.update).not.toHaveBeenCalled()
  })
})
