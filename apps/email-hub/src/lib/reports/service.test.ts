import { describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

import { getReport, parseReportName } from "./service"

describe("parseReportName", () => {
  it("throws not_found for unknown names", () => {
    expect(() => parseReportName("unknown")).toThrow(AppError)
    expect(() => parseReportName("unknown")).toThrow(
      expect.objectContaining({ code: "not_found" })
    )
  })
})

describe("getReport", () => {
  it("returns ClickHouse rows for hand-computed sending fixtures on DST days", async () => {
    const runQuery = vi.fn().mockResolvedValue([
      {
        day: "2026-03-08",
        sending_domain: "example.com",
        provider: "gmail",
        sent: 10,
        delivered: 9,
        bounce_hard: 1,
        bounce_soft: 0,
        delivery_delay: 0,
        complaint: 0,
        reject: 0,
      },
      {
        day: "2026-11-01",
        sending_domain: "example.com",
        provider: "gmail",
        sent: 5,
        delivered: 5,
        bounce_hard: 0,
        bounce_soft: 0,
        delivery_delay: 0,
        complaint: 0,
        reject: 0,
      },
    ])

    const result = await getReport(
      "sending",
      { from: "2026-03-08", to: "2026-11-01", include_machine: false },
      runQuery
    )

    expect(runQuery).toHaveBeenCalledWith(
      expect.stringContaining("daily_sending_stats"),
      { from: "2026-03-08", to: "2026-11-01" }
    )
    expect(result.data).toHaveLength(2)
    expect(
      result.data.reduce((sum, row) => sum + Number(row.sent ?? 0), 0)
    ).toBe(15)
    expect(
      result.data.reduce((sum, row) => sum + Number(row.delivered ?? 0), 0)
    ).toBe(14)
    expect(result.from).toBe("2026-03-08")
    expect(result.to).toBe("2026-11-01")
  })
})
