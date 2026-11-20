import {
  BLOCKLIST_CHECK_INTERVAL_MS,
  BLOCKLIST_CHECK_JOB_NAME,
  ET_TIME_ZONE,
  SES_HEALTH_INTERVAL_MS,
  SES_HEALTH_JOB_NAME,
} from "@workspace/shared"
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
    expect(ids).not.toContain(BLOCKLIST_CHECK_JOB_NAME)
    expect(ids).toContain("schedule-promoter")
    expect(ids).toContain("queue-watchdog")
    expect(ids).toContain(SES_HEALTH_JOB_NAME)
  })

  it("schedules blocklist-check every 6 hours in prod only", () => {
    const entry = SCHEDULER_DEFINITIONS.find(
      (item) => item.id === BLOCKLIST_CHECK_JOB_NAME
    )
    expect(entry).toMatchObject({
      queue: "monitoring",
      jobName: BLOCKLIST_CHECK_JOB_NAME,
      enabledInDev: false,
      repeat: { every: BLOCKLIST_CHECK_INTERVAL_MS },
      opts: {
        attempts: 2,
        backoff: { type: "fixed", delay: 60_000 },
      },
    })
    expect(schedulersForEnv("prod").map((item) => item.id)).toContain(
      BLOCKLIST_CHECK_JOB_NAME
    )
  })

  it("schedules ses-health every 5 minutes on the monitoring queue", () => {
    expect(SES_HEALTH_INTERVAL_MS).toBe(300_000)
    const sesHealth = SCHEDULER_DEFINITIONS.find(
      (entry) => entry.id === SES_HEALTH_JOB_NAME
    )
    expect(sesHealth).toMatchObject({
      queue: "monitoring",
      jobName: SES_HEALTH_JOB_NAME,
      enabledInDev: true,
      repeat: { every: 300_000 },
      opts: { attempts: 1 },
    })
    expect(sesHealth?.queue).not.toBe("send-email")
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

    const sesHealthCalls = upsert.mock.calls.filter(
      (call) => call[0] === SES_HEALTH_JOB_NAME
    )
    expect(sesHealthCalls).toHaveLength(2)
    expect(sesHealthCalls[0]?.[1]).toEqual({ every: SES_HEALTH_INTERVAL_MS })
    expect(sesHealthCalls[0]?.[2]).toMatchObject({
      name: SES_HEALTH_JOB_NAME,
      data: {},
    })
    expect(sesHealthCalls[1]?.[1]).toEqual(sesHealthCalls[0]?.[1])
    expect(sesHealthCalls[1]?.[2]).toMatchObject({
      name: SES_HEALTH_JOB_NAME,
    })
  })
})
