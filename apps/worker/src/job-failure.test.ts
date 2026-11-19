import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  QUEUE_JOB_FAILED_ALERT_TYPE,
  QUEUE_JOB_FAILED_WINDOW_MS,
  handleFinalJobFailure,
  isFinalJobFailure,
  isUnrecoverableError,
  openQueueJobFailedAlert,
  queueJobFailedDedupeKey,
} from "./job-failure.js"

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }),
  serializeError: (error: unknown) => {
    if (error instanceof Error) {
      return { type: error.name, message: error.message }
    }
    return { type: "unknown", message: "Non-error thrown" }
  },
}))

describe("job failure helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("treats UnrecoverableError as final", () => {
    const err = new UnrecoverableError("permanent")
    expect(isUnrecoverableError(err)).toBe(true)
    expect(
      isFinalJobFailure({ attemptsMade: 1, opts: { attempts: 5 } }, err)
    ).toBe(true)
  })

  it("treats last attempt as final and earlier attempts as retryable", () => {
    const err = new Error("temp")
    expect(
      isFinalJobFailure({ attemptsMade: 4, opts: { attempts: 5 } }, err)
    ).toBe(false)
    expect(
      isFinalJobFailure({ attemptsMade: 5, opts: { attempts: 5 } }, err)
    ).toBe(true)
  })

  it("builds the queue_job dedupe key", () => {
    expect(queueJobFailedDedupeKey("send-email", "send-email")).toBe(
      "queue_job:send-email:send-email"
    )
  })
})

describe("openQueueJobFailedAlert", () => {
  it("opens once and skips resolved alerts within the hourly window", async () => {
    const now = new Date("2026-11-18T15:00:00.000Z")
    const openAlertFn = vi.fn(async () => ({ created: true }))
    const openedAt = new Date(now.getTime() - 10 * 60_000)
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  id: "a1",
                  type: QUEUE_JOB_FAILED_ALERT_TYPE,
                  status: "resolved",
                  openedAt,
                  dedupeKey: "queue_job:dispatch:dispatch-send",
                },
              ]),
            })),
          })),
        })),
      })),
    }

    const skipped = await openQueueJobFailedAlert(
      {
        db: db as never,
        now: () => now,
        openAlertFn: openAlertFn as never,
      },
      {
        queueName: "dispatch",
        jobName: "dispatch-send",
        error: new Error("boom"),
      }
    )
    expect(skipped).toEqual({ skipped: true, reason: "hourly_limit" })
    expect(openAlertFn).not.toHaveBeenCalled()
  })

  it("opens when the previous resolved alert is older than one hour", async () => {
    const now = new Date("2026-11-18T15:00:00.000Z")
    const openAlertFn = vi.fn(async () => ({ created: true, alert: {} }))
    const openedAt = new Date(now.getTime() - QUEUE_JOB_FAILED_WINDOW_MS - 1)
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  id: "a1",
                  type: QUEUE_JOB_FAILED_ALERT_TYPE,
                  status: "resolved",
                  openedAt,
                  dedupeKey: "queue_job:events:events-writer",
                },
              ]),
            })),
          })),
        })),
      })),
    }

    const result = await openQueueJobFailedAlert(
      {
        db: db as never,
        now: () => now,
        openAlertFn: openAlertFn as never,
      },
      {
        queueName: "events",
        jobName: "events-writer",
        jobId: "job-1",
        error: new Error("boom"),
        requestId: "req-1",
      }
    )
    expect(result).toEqual({ created: true, alert: {} })
    expect(openAlertFn).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        type: QUEUE_JOB_FAILED_ALERT_TYPE,
        severity: "warning",
        dedupeKey: "queue_job:events:events-writer",
        payload: expect.objectContaining({
          queue: "events",
          job_name: "events-writer",
          job_id: "job-1",
          request_id: "req-1",
          error_type: "Error",
          error_message: "boom",
        }),
      })
    )
  })

  it("bumps an already-open alert without hourly skip", async () => {
    const now = new Date("2026-11-18T15:00:00.000Z")
    const openAlertFn = vi.fn(async () => ({ created: false, alert: {} }))
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => [
                {
                  id: "a1",
                  type: QUEUE_JOB_FAILED_ALERT_TYPE,
                  status: "open",
                  openedAt: now,
                  dedupeKey: "queue_job:sync:optizmo-sync",
                },
              ]),
            })),
          })),
        })),
      })),
    }

    await openQueueJobFailedAlert(
      {
        db: db as never,
        now: () => now,
        openAlertFn: openAlertFn as never,
      },
      {
        queueName: "sync",
        jobName: "optizmo-sync",
        error: new Error("still failing"),
      }
    )
    expect(openAlertFn).toHaveBeenCalledTimes(1)
  })
})

describe("handleFinalJobFailure", () => {
  it("logs, captures once, and opens the alert", async () => {
    const openAlertFn = vi.fn(async () => ({ created: true, alert: {} }))
    const captureException = vi.fn()
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
      })),
    }
    const job = {
      id: "job-9",
      name: "csv-ingest",
      attemptsMade: 1,
      opts: { attempts: 1 },
      data: { request_id: "req-9" },
    }

    await handleFinalJobFailure(
      {
        db: db as never,
        openAlertFn: openAlertFn as never,
        captureException,
      },
      {
        queueName: "intake",
        job: job as never,
        error: new UnrecoverableError("bad csv"),
      }
    )

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      expect.any(UnrecoverableError),
      expect.objectContaining({
        queue: "intake",
        jobName: "csv-ingest",
        jobId: "job-9",
        requestId: "req-9",
      })
    )
    expect(openAlertFn).toHaveBeenCalledTimes(1)
  })
})
