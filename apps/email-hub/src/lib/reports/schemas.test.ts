import { describe, expect, it } from "vitest"

import {
  inclusiveEtDayCount,
  MAX_REPORT_RANGE_DAYS,
  reportNameSchema,
  reportQuerySchema,
} from "./schemas"

describe("inclusiveEtDayCount", () => {
  it("counts inclusive calendar days across 2026 DST transitions", () => {
    expect(inclusiveEtDayCount("2026-03-08", "2026-03-08")).toBe(1)
    expect(inclusiveEtDayCount("2026-11-01", "2026-11-01")).toBe(1)
    expect(inclusiveEtDayCount("2026-03-08", "2026-03-09")).toBe(2)
    expect(inclusiveEtDayCount("2026-03-01", "2026-05-31")).toBe(92)
  })
})

describe("reportQuerySchema", () => {
  it("accepts a 92-day inclusive ET window", () => {
    expect(
      reportQuerySchema.parse({
        from: "2026-03-01",
        to: "2026-05-31",
      })
    ).toEqual({
      from: "2026-03-01",
      to: "2026-05-31",
      include_machine: false,
    })
  })

  it("rejects ranges longer than 92 days", () => {
    const result = reportQuerySchema.safeParse({
      from: "2026-03-01",
      to: "2026-06-01",
    })
    expect(result.success).toBe(false)
    expect(
      result.success ? "" : (result.error.issues[0]?.message ?? "")
    ).toContain(String(MAX_REPORT_RANGE_DAYS))
  })

  it("rejects reversed ranges", () => {
    const result = reportQuerySchema.safeParse({
      from: "2026-11-01",
      to: "2026-03-08",
    })
    expect(result.success).toBe(false)
  })

  it("parses include_machine", () => {
    expect(
      reportQuerySchema.parse({
        from: "2026-03-08",
        to: "2026-03-08",
        include_machine: "true",
      }).include_machine
    ).toBe(true)
  })
})

describe("reportNameSchema", () => {
  it("accepts known report names", () => {
    expect(reportNameSchema.parse("sending")).toBe("sending")
    expect(reportNameSchema.parse("link-clicks")).toBe("link-clicks")
    expect(reportNameSchema.parse("provider-metrics")).toBe("provider-metrics")
  })

  it("rejects unknown names", () => {
    expect(reportNameSchema.safeParse("daily-sending").success).toBe(false)
  })
})
