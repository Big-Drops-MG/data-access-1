import { ET_TIME_ZONE } from "@workspace/shared"
import { describe, expect, it, vi } from "vitest"

import {
  SCHEDULER_DEFINITIONS,
  registerJobSchedulers,
  schedulersForEnv,
} from "./schedulers.js"

describe("schedulers catalog", () => {
  it("uses unique fixed ids equal to job names", () => {
    const ids = SCHEDULER_DEFINITIONS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of SCHEDULER_DEFINITIONS) {
      expect(entry.id).toBe(entry.jobName)
    }
  })

  it("uses America/New_York on every cron scheduler", () => {
    const cronEntries = SCHEDULER_DEFINITIONS.filter(
      (entry) => "pattern" in entry.repeat
    )
    expect(cronEntries.length).toBeGreaterThan(0)
    expect(
      cronEntries.every(
        (entry) => "pattern" in entry.repeat && entry.repeat.tz === ET_TIME_ZONE
      )
    ).toBe(true)
  })

  it("omits prod-only schedulers in dev", () => {
    const ids = schedulersForEnv("dev").map((entry) => entry.id)
    expect(ids).not.toContain("provider-metrics-pull")
    expect(ids).not.toContain("optizmo-sync")
    expect(ids).not.toContain("blocklist-check")
    expect(ids).toContain("schedule-promoter")
    expect(ids).toContain("queue-watchdog")
  })

  it("registers all schedulers in prod", () => {
    expect(schedulersForEnv("prod")).toHaveLength(SCHEDULER_DEFINITIONS.length)
  })
})

describe("registerJobSchedulers", () => {
  it("upserts each enabled scheduler with a fixed id (idempotent)", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined)
    const queues = {
      dispatch: { upsertJobScheduler: upsert },
      monitoring: { upsertJobScheduler: upsert },
      intake: { upsertJobScheduler: upsert },
      sync: { upsertJobScheduler: upsert },
      maintenance: { upsertJobScheduler: upsert },
    }

    const first = await registerJobSchedulers(queues as never, "dev")
    const second = await registerJobSchedulers(queues as never, "dev")

    expect(first).toEqual(second)
    expect(first).toHaveLength(schedulersForEnv("dev").length)
    expect(upsert).toHaveBeenCalledTimes(first.length * 2)

    const schedulePromoterCalls = upsert.mock.calls.filter(
      (call) => call[0] === "schedule-promoter"
    )
    expect(schedulePromoterCalls).toHaveLength(2)
    expect(schedulePromoterCalls[0]?.[1]).toEqual({ every: 60_000 })
    expect(schedulePromoterCalls[0]?.[2]).toMatchObject({
      name: "schedule-promoter",
      data: {},
    })
  })
})
