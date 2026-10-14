import { describe, expect, it } from "vitest"

import { formatEtDateTime, getEtWallTime, resolveEtWallTime } from "./time.js"

describe("formatEtDateTime", () => {
  it("formats in America/New_York with zone abbreviation", () => {
    // 2026-03-08 07:00 UTC = 3:00 AM EDT (after spring forward)
    expect(formatEtDateTime(new Date("2026-03-08T07:00:00.000Z"))).toBe(
      "Mar 8, 2026, 3:00 AM EDT"
    )
  })
})

describe("resolveEtWallTime — 2026 DST", () => {
  it("accepts a normal EST wall time", () => {
    const utc = new Date("2026-01-15T19:30:00.000Z")
    expect(
      resolveEtWallTime({
        year: 2026,
        month: 1,
        day: 15,
        hour: 14,
        minute: 30,
      })
    ).toEqual({ status: "ok", utc })
    expect(getEtWallTime(utc)).toMatchObject({
      year: 2026,
      month: 1,
      day: 15,
      hour: 14,
      minute: 30,
    })
  })

  it("rejects nonexistent spring-forward times on 2026-03-08", () => {
    // Clocks jump 2:00 AM EST → 3:00 AM EDT; 2:30 does not exist.
    expect(
      resolveEtWallTime({
        year: 2026,
        month: 3,
        day: 8,
        hour: 2,
        minute: 30,
      })
    ).toEqual({ status: "nonexistent" })
  })

  it("accepts 1:59 AM before spring forward and 3:00 AM after", () => {
    expect(
      resolveEtWallTime({
        year: 2026,
        month: 3,
        day: 8,
        hour: 1,
        minute: 59,
      })
    ).toEqual({
      status: "ok",
      utc: new Date("2026-03-08T06:59:00.000Z"),
    })

    expect(
      resolveEtWallTime({
        year: 2026,
        month: 3,
        day: 8,
        hour: 3,
        minute: 0,
      })
    ).toEqual({
      status: "ok",
      utc: new Date("2026-03-08T07:00:00.000Z"),
    })
  })

  it("returns both UTC instants for ambiguous fall-back times on 2026-11-01", () => {
    // 1:30 AM occurs twice: first as EDT, then as EST.
    const earlier = new Date("2026-11-01T05:30:00.000Z")
    const later = new Date("2026-11-01T06:30:00.000Z")
    expect(
      resolveEtWallTime({
        year: 2026,
        month: 11,
        day: 1,
        hour: 1,
        minute: 30,
      })
    ).toEqual({ status: "ambiguous", earlier, later })
    expect(formatEtDateTime(earlier)).toBe("Nov 1, 2026, 1:30 AM EDT")
    expect(formatEtDateTime(later)).toBe("Nov 1, 2026, 1:30 AM EST")
  })

  it("accepts unambiguous times around fall back", () => {
    expect(
      resolveEtWallTime({
        year: 2026,
        month: 11,
        day: 1,
        hour: 0,
        minute: 30,
      })
    ).toEqual({
      status: "ok",
      utc: new Date("2026-11-01T04:30:00.000Z"),
    })

    expect(
      resolveEtWallTime({
        year: 2026,
        month: 11,
        day: 1,
        hour: 2,
        minute: 0,
      })
    ).toEqual({
      status: "ok",
      utc: new Date("2026-11-01T07:00:00.000Z"),
    })
  })
})
