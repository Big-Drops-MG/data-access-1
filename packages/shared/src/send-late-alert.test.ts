import { describe, expect, it, vi } from "vitest"

import {
  SEND_LATE_ALERT_TYPE,
  sendLateAlertDedupeKey,
} from "./dispatch-queue.js"
import { openSendLateAlert } from "./send-late-alert.js"

describe("openSendLateAlert", () => {
  it("no-ops when the send is within the late threshold", async () => {
    const insert = vi.fn()
    const db = { insert, update: vi.fn() }
    const scheduledFor = new Date("2026-11-05T12:00:00.000Z")

    await openSendLateAlert(
      db as never,
      "01900000-0000-7000-8000-000000000500",
      scheduledFor,
      new Date(scheduledFor.getTime() + 5 * 60_000)
    )

    expect(insert).not.toHaveBeenCalled()
  })

  it("inserts a send_late alert when overdue", async () => {
    const returning = vi.fn(async () => [
      {
        id: "01900000-0000-7000-8000-0000000005a1",
        type: SEND_LATE_ALERT_TYPE,
        severity: "warning",
        dedupeKey: sendLateAlertDedupeKey(
          "01900000-0000-7000-8000-000000000501"
        ),
      },
    ])
    const onConflictDoNothing = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const db = {
      insert: () => ({ values }),
      update: vi.fn(),
    }
    const sendId = "01900000-0000-7000-8000-000000000501"
    const scheduledFor = new Date("2026-11-05T12:00:00.000Z")
    const now = new Date("2026-11-05T12:20:00.000Z")

    await openSendLateAlert(db as never, sendId, scheduledFor, now)

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SEND_LATE_ALERT_TYPE,
        severity: "warning",
        status: "open",
        dedupeKey: sendLateAlertDedupeKey(sendId),
        payload: {
          send_id: sendId,
          scheduled_for: scheduledFor.toISOString(),
          minutes_late: 20,
        },
      })
    )
  })
})
