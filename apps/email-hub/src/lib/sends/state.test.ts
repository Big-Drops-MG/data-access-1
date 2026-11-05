import { describe, expect, it } from "vitest"

import { AppError } from "@workspace/shared"

import {
  SEND_MIN_LEAD_MS,
  assertScheduleLeadTime,
  assertSendEditable,
  assertTransition,
  canTransition,
  type SendStatus,
} from "./state"

const NOW = new Date("2026-11-05T12:00:00.000Z")

const STATUSES: SendStatus[] = [
  "draft",
  "scheduled",
  "queued",
  "dispatching",
  "completed",
  "cancelled",
  "failed",
]

describe("send state machine", () => {
  it("allows draft to scheduled and scheduled/dispatching to cancelled", () => {
    expect(canTransition("draft", "scheduled")).toBe(true)
    expect(canTransition("scheduled", "cancelled")).toBe(true)
    expect(canTransition("dispatching", "cancelled")).toBe(true)

    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const allowed =
          (from === "draft" && to === "scheduled") ||
          (from === "scheduled" && to === "cancelled") ||
          (from === "dispatching" && to === "cancelled")
        expect(canTransition(from, to)).toBe(allowed)
      }
    }
  })

  it("rejects a prohibited transition without changing the caller state", () => {
    expect(() => assertTransition("cancelled", "scheduled")).toThrow(AppError)
    expect(() => assertTransition("completed", "cancelled")).toThrow(AppError)
    expect(() => assertTransition("scheduled", "scheduled")).toThrow(AppError)
    let caught: unknown
    try {
      assertTransition("cancelled", "scheduled")
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({
      code: "conflict",
      status: 409,
      details: [
        {
          path: "status",
          message: "Cannot transition from cancelled to scheduled",
        },
      ],
    })
  })

  it("locks configuration after draft", () => {
    expect(() => assertSendEditable("draft")).not.toThrow()
    for (const status of STATUSES.filter((status) => status !== "draft")) {
      expect(() => assertSendEditable(status)).toThrow(AppError)
    }
  })
})

describe("schedule lead time", () => {
  const cases: { id: string; offsetMs: number; accept: boolean }[] = [
    { id: "TIME-01", offsetMs: -60_000, accept: false },
    { id: "TIME-02", offsetMs: 0, accept: false },
    { id: "TIME-03", offsetMs: 60_000, accept: false },
    { id: "TIME-04", offsetMs: SEND_MIN_LEAD_MS - 1_000, accept: false },
    { id: "TIME-05", offsetMs: SEND_MIN_LEAD_MS, accept: true },
    { id: "TIME-06", offsetMs: SEND_MIN_LEAD_MS + 1_000, accept: true },
    { id: "TIME-07", offsetMs: 30 * 60_000, accept: true },
  ]

  it.each(cases.filter((testCase) => testCase.accept))(
    "$id accepts offset $offsetMs",
    ({ offsetMs }) => {
      const scheduledFor = new Date(NOW.getTime() + offsetMs)
      expect(() => assertScheduleLeadTime(scheduledFor, NOW)).not.toThrow()
    }
  )

  it.each(cases.filter((testCase) => !testCase.accept))(
    "$id rejects offset $offsetMs",
    ({ offsetMs }) => {
      const scheduledFor = new Date(NOW.getTime() + offsetMs)
      expect(() => assertScheduleLeadTime(scheduledFor, NOW)).toThrow(AppError)
    }
  )

  it("rejects an invalid timestamp", () => {
    expect(() => assertScheduleLeadTime(new Date("not-a-date"), NOW)).toThrow(
      AppError
    )
  })

  it("rejects a draft time that is valid at save and stale at schedule", () => {
    const scheduledFor = new Date(NOW.getTime() + 6 * 60_000)
    expect(() => assertScheduleLeadTime(scheduledFor, NOW)).not.toThrow()
    const later = new Date(NOW.getTime() + 2 * 60_000)
    expect(() => assertScheduleLeadTime(scheduledFor, later)).toThrow(AppError)
  })
})
