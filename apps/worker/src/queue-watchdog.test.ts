import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ORPHAN_QUEUED_AGE_MS,
  processQueueWatchdogJob,
  SEND_EMAIL_DEPTH_DURATION_MS,
  SEND_EMAIL_DEPTH_THRESHOLD,
} from "./queue-watchdog.js"

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

const MESSAGE_ID = "01900000-0000-7000-8000-000000000401"

describe("processQueueWatchdogJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("re-enqueues orphan queued messages older than 5 minutes", async () => {
    const now = new Date("2026-11-18T12:00:00.000Z")
    const enqueueOrphan = vi.fn(async () => undefined)
    const openAlertFn = vi.fn(async () => ({ created: true }))
    const closeAlertFn = vi.fn(async () => ({ closed: true }))
    const redis = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => "OK"),
      del: vi.fn(async () => 1),
    }

    const sendEmailQueue = {
      name: "send-email",
      getJobCounts: vi.fn(async () => ({
        waiting: 0,
        active: 0,
        failed: 0,
        delayed: 0,
      })),
      getJobs: vi.fn(async () => []),
      getJob: vi.fn(async () => undefined),
      add: vi.fn(),
    }

    let selectCalls = 0
    const db = {
      select: vi.fn(() => {
        selectCalls += 1
        if (selectCalls === 1) {
          return {
            from: () => ({
              where: () => ({
                limit: async () => [],
              }),
            }),
          }
        }
        return {
          from: () => ({
            where: () => ({
              limit: async () => [{ id: MESSAGE_ID }],
            }),
          }),
        }
      }),
    }

    await processQueueWatchdogJob({
      db: db as never,
      queues: [sendEmailQueue],
      sendEmailQueue: sendEmailQueue as never,
      redis,
      schedulers: [],
      now: () => now,
      openAlertFn: openAlertFn as never,
      closeAlertFn: closeAlertFn as never,
      enqueueOrphan,
    })

    expect(enqueueOrphan).toHaveBeenCalledWith(MESSAGE_ID)
    expect(sendEmailQueue.getJob).toHaveBeenCalledWith(MESSAGE_ID)
    expect(now.getTime() - ORPHAN_QUEUED_AGE_MS).toBeLessThan(now.getTime())
  })

  it("opens queue_depth after sustained high waiting count", async () => {
    const now = new Date("2026-11-18T12:00:00.000Z")
    const since = String(now.getTime() - SEND_EMAIL_DEPTH_DURATION_MS - 1)
    const openAlertFn = vi.fn(async () => ({ created: true }))
    const closeAlertFn = vi.fn(async () => ({ closed: true }))
    const redis = {
      get: vi.fn(async () => since),
      set: vi.fn(async () => "OK"),
      del: vi.fn(async () => 1),
    }
    const sendEmailQueue = {
      name: "send-email",
      getJobCounts: vi.fn(async () => ({
        waiting: SEND_EMAIL_DEPTH_THRESHOLD + 1,
        active: 0,
        failed: 0,
        delayed: 0,
      })),
      getJobs: vi.fn(async () => []),
      getJob: vi.fn(async () => undefined),
      add: vi.fn(),
    }
    let selectCalls = 0
    const db = {
      select: vi.fn(() => {
        selectCalls += 1
        return {
          from: () => ({
            where: () => ({
              limit: async () => (selectCalls >= 1 ? [] : []),
            }),
          }),
        }
      }),
    }

    await processQueueWatchdogJob({
      db: db as never,
      queues: [sendEmailQueue],
      sendEmailQueue: sendEmailQueue as never,
      redis,
      schedulers: [],
      now: () => now,
      openAlertFn: openAlertFn as never,
      closeAlertFn: closeAlertFn as never,
      enqueueOrphan: vi.fn(async () => undefined),
    })

    expect(openAlertFn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "queue_depth",
        dedupeKey: "queue_depth:send-email",
      })
    )
  })
})
