import { describe, expect, it, vi } from "vitest"

import {
  OPTIZMO_SYNC_JOB_NAME,
  OPTIZMO_SYNC_JOB_OPTIONS,
  OPTIZMO_SYNC_WORKER_CONCURRENCY,
  enqueueOptizmoSyncJob,
  optizmoSyncJobId,
} from "./optizmo-queue.js"

const OFFER_ID = "019a0000-0000-7000-8000-0000000000aa"

describe("optizmo-queue", () => {
  it("builds daily job ids and caps concurrency at 3", () => {
    expect(optizmoSyncJobId(OFFER_ID, "2026-11-17")).toBe(
      `optizmo:${OFFER_ID}:2026-11-17`
    )
    expect(OPTIZMO_SYNC_WORKER_CONCURRENCY).toBe(3)
    expect(OPTIZMO_SYNC_JOB_OPTIONS.attempts).toBe(3)
  })

  it("enqueues one job per offer with retry backoff", async () => {
    const add = vi.fn(async () => undefined)
    await enqueueOptizmoSyncJob(
      { add, getJob: vi.fn() },
      {
        offerId: OFFER_ID,
        trigger: "manual",
        now: new Date("2026-11-17T08:00:00.000Z"),
      }
    )
    expect(add).toHaveBeenCalledWith(
      OPTIZMO_SYNC_JOB_NAME,
      expect.objectContaining({
        offer_id: OFFER_ID,
        trigger: "manual",
      }),
      expect.objectContaining({
        jobId: `optizmo:${OFFER_ID}:2026-11-17`,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      })
    )
  })

  it("ignores duplicate in-flight job ids", async () => {
    const add = vi.fn(async () => {
      throw new Error("Job optizmo:... already exists")
    })
    await expect(
      enqueueOptizmoSyncJob(
        { add, getJob: vi.fn() },
        { offerId: OFFER_ID, now: new Date("2026-11-17T08:00:00.000Z") }
      )
    ).resolves.toBeUndefined()
  })
})
