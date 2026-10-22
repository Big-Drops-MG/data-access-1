import { describe, expect, it } from "vitest"

import {
  etToUtc,
  formatEtDate,
  formatEtDateTime,
  formatEtTime,
  getEtAbbreviation,
  getEtDayRange,
  getEtReportRange,
  getEtWallTime,
  parseEtDateString,
  resolveEtWallTime,
  utcToEt,
} from "./time.js"

const HOUR_MS = 60 * 60 * 1000

describe("formatEtDateTime", () => {
  it("formats in America/New_York with zone abbreviation", () => {
    // 2026-03-08 07:00 UTC = 3:00 AM EDT (after spring forward)
    expect(formatEtDateTime(new Date("2026-03-08T07:00:00.000Z"))).toBe(
      "Mar 8, 2026, 3:00 AM EDT"
    )
  })

  it("accepts ISO strings and returns empty for invalid values", () => {
    expect(formatEtDateTime("2026-03-08T07:00:00.000Z")).toBe(
      "Mar 8, 2026, 3:00 AM EDT"
    )
    expect(formatEtDateTime("not-a-date")).toBe("")
  })
})

describe("formatEtDate / formatEtTime / getEtAbbreviation", () => {
  it("formats ET calendar date and clock time", () => {
    const instant = new Date("2026-01-15T19:30:00.000Z")
    expect(formatEtDate(instant)).toBe("2026-01-15")
    expect(formatEtTime(instant)).toBe("14:30")
    expect(getEtAbbreviation(instant)).toBe("EST")
  })

  it("returns empty strings for invalid date/time inputs", () => {
    expect(formatEtDate("nope")).toBe("")
    expect(formatEtTime("nope")).toBe("")
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

describe("utcToEt / etToUtc", () => {
  it("round-trips a normal EST instant", () => {
    const utc = new Date("2026-01-15T19:30:00.000Z")
    expect(utcToEt(utc)).toMatchObject({
      year: 2026,
      month: 1,
      day: 15,
      hour: 14,
      minute: 30,
      second: 0,
    })
    expect(etToUtc(utcToEt(utc))).toEqual(utc)
  })

  it("throws on spring-forward nonexistent wall times", () => {
    expect(() =>
      etToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 })
    ).toThrow(/does not exist/)
  })

  it("disambiguates fall-back times on 2026-11-01", () => {
    const wall = { year: 2026, month: 11, day: 1, hour: 1, minute: 30 }
    expect(etToUtc(wall, "earlier")).toEqual(
      new Date("2026-11-01T05:30:00.000Z")
    )
    expect(etToUtc(wall, "later")).toEqual(new Date("2026-11-01T06:30:00.000Z"))
  })

  it("rejects invalid UTC input", () => {
    expect(() => utcToEt("not-a-date")).toThrow(/Invalid UTC instant/)
  })
})

describe("getEtDayRange — 2026 DST days", () => {
  it("is 23 hours on spring-forward day 2026-03-08", () => {
    const { start, endExclusive } = getEtDayRange("2026-03-08")
    // Midnight EST → 05:00 UTC; next midnight EDT → 04:00 UTC (next calendar day).
    expect(start).toEqual(new Date("2026-03-08T05:00:00.000Z"))
    expect(endExclusive).toEqual(new Date("2026-03-09T04:00:00.000Z"))
    expect(endExclusive.getTime() - start.getTime()).toBe(23 * HOUR_MS)
  })

  it("is 25 hours on fall-back day 2026-11-01", () => {
    const { start, endExclusive } = getEtDayRange("2026-11-01")
    // Midnight EDT → 04:00 UTC; next midnight EST → 05:00 UTC.
    expect(start).toEqual(new Date("2026-11-01T04:00:00.000Z"))
    expect(endExclusive).toEqual(new Date("2026-11-02T05:00:00.000Z"))
    expect(endExclusive.getTime() - start.getTime()).toBe(25 * HOUR_MS)
  })

  it("is 24 hours on a normal winter day", () => {
    const { start, endExclusive } = getEtDayRange("2026-01-15")
    expect(start).toEqual(new Date("2026-01-15T05:00:00.000Z"))
    expect(endExclusive).toEqual(new Date("2026-01-16T05:00:00.000Z"))
    expect(endExclusive.getTime() - start.getTime()).toBe(24 * HOUR_MS)
  })
})

describe("getEtReportRange / parseEtDateString", () => {
  it("spans inclusive ET dates including both 2026 DST transition days", () => {
    const { start, endExclusive } = getEtReportRange("2026-03-08", "2026-11-01")
    expect(start).toEqual(new Date("2026-03-08T05:00:00.000Z"))
    expect(endExclusive).toEqual(new Date("2026-11-02T05:00:00.000Z"))
  })

  it("equals a single day range when from === to", () => {
    expect(getEtReportRange("2026-03-08", "2026-03-08")).toEqual(
      getEtDayRange("2026-03-08")
    )
  })

  it("rejects invalid or reversed ranges", () => {
    expect(() => parseEtDateString("03-08-2026")).toThrow(/Invalid ET date/)
    expect(() => parseEtDateString("2026-02-30")).toThrow(/Invalid ET calendar/)
    expect(() => getEtReportRange("2026-11-01", "2026-03-08")).toThrow(
      /empty or reversed/
    )
  })
})
