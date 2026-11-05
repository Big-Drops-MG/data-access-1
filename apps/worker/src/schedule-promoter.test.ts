import type { Send } from "@workspace/db"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { processSchedulePromoterJob } from "./schedule-promoter.js"

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

const SEND_ID = "01900000-0000-7000-8000-000000000300"

function sendRow(overrides: Partial<Send> = {}): Send {
  const now = new Date("2026-11-05T12:00:00.000Z")
  return {
    id: SEND_ID,
    emailType: "engagement",
    templateVersionId: "01900000-0000-7000-8000-000000000301",
    senderId: "01900000-0000-7000-8000-000000000302",
    offerId: null,
    categoryId: "01900000-0000-7000-8000-000000000303",
    scheduledFor: new Date("2026-11-05T11:00:00.000Z"),
    status: "scheduled",
    dispatchStartedAt: null,
    completedAt: null,
    version: 1,
    createdBy: "01900000-0000-7000-8000-000000000399",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("processSchedulePromoterJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("enqueues due scheduled sends and opens send_late when overdue", async () => {
    const due = [sendRow()]
    const enqueueDispatchSend = vi.fn(async () => undefined)
    const openLateAlert = vi.fn(async () => undefined)
    const now = new Date("2026-11-05T12:00:00.000Z")

    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(due),
        }),
      }),
    }

    await processSchedulePromoterJob({
      db: db as never,
      dispatchQueue: { add: vi.fn(), getJob: vi.fn() },
      now: () => now,
      enqueueDispatchSend,
      openLateAlert,
    })

    expect(openLateAlert).toHaveBeenCalledWith(
      SEND_ID,
      due[0]!.scheduledFor,
      now
    )
    expect(enqueueDispatchSend).toHaveBeenCalledWith(SEND_ID)
  })

  it("stops and rethrows when enqueue fails", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([sendRow()]),
        }),
      }),
    }
    const enqueueDispatchSend = vi.fn(async () => {
      throw new Error("redis down")
    })

    await expect(
      processSchedulePromoterJob({
        db: db as never,
        dispatchQueue: { add: vi.fn(), getJob: vi.fn() },
        enqueueDispatchSend,
        openLateAlert: vi.fn(async () => undefined),
      })
    ).rejects.toThrow("redis down")
  })
})
