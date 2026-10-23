import { describe, expect, it } from "vitest"

import {
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
  isSessionPastAbsoluteLimit,
} from "./session-policy"

describe("session-policy", () => {
  it("uses 12 h absolute and 2 h idle lifetimes", () => {
    expect(SESSION_ABSOLUTE_SECONDS).toBe(12 * 60 * 60)
    expect(SESSION_IDLE_SECONDS).toBe(2 * 60 * 60)
  })

  it("isSessionPastAbsoluteLimit is false within 12 h", () => {
    const createdAt = new Date("2026-10-22T00:00:00.000Z")
    const now = new Date("2026-10-22T11:59:59.000Z")
    expect(isSessionPastAbsoluteLimit(createdAt, now)).toBe(false)
  })

  it("isSessionPastAbsoluteLimit is true after 12 h", () => {
    const createdAt = new Date("2026-10-22T00:00:00.000Z")
    const now = new Date("2026-10-22T12:00:00.001Z")
    expect(isSessionPastAbsoluteLimit(createdAt, now)).toBe(true)
  })
})
