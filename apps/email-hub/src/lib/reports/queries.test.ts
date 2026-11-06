import { describe, expect, it } from "vitest"

import { buildReportQuery, LINK_CLICKS_TOP_LIMIT } from "./queries"

describe("buildReportQuery", () => {
  it("uses bound from/to Date params for sending", () => {
    const plan = buildReportQuery({
      name: "sending",
      from: "2026-03-08",
      to: "2026-11-01",
      includeMachine: false,
    })
    expect(plan.query).toContain("{from:Date}")
    expect(plan.query).toContain("{to:Date}")
    expect(plan.query).not.toContain("2026-03-08")
    expect(plan.query_params).toEqual({
      from: "2026-03-08",
      to: "2026-11-01",
    })
  })

  it("defaults engagement and environment to human-only rows", () => {
    const engagement = buildReportQuery({
      name: "engagement",
      from: "2026-03-08",
      to: "2026-03-08",
      includeMachine: false,
    })
    expect(engagement.query).toContain("is_machine = {is_machine:UInt8}")
    expect(engagement.query).toContain("uniqMerge(unique_opens)")
    expect(engagement.query_params).toMatchObject({ is_machine: 0 })

    const all = buildReportQuery({
      name: "engagement",
      from: "2026-03-08",
      to: "2026-03-08",
      includeMachine: true,
    })
    expect(all.query).not.toContain("is_machine")
    expect(all.query_params).not.toHaveProperty("is_machine")
  })

  it("caps link-clicks at the top 100 with bound limit", () => {
    const plan = buildReportQuery({
      name: "link-clicks",
      from: "2026-03-08",
      to: "2026-03-09",
      includeMachine: false,
    })
    expect(plan.query).toContain("LIMIT {limit:UInt32}")
    expect(plan.query_params).toMatchObject({
      limit: LINK_CLICKS_TOP_LIMIT,
      is_machine: 0,
    })
  })

  it("reads provider metrics with FINAL", () => {
    const plan = buildReportQuery({
      name: "provider-metrics",
      from: "2026-03-08",
      to: "2026-03-08",
      includeMachine: false,
    })
    expect(plan.query).toContain("FINAL")
    expect(plan.query_params).toEqual({
      from: "2026-03-08",
      to: "2026-03-08",
    })
  })
})
