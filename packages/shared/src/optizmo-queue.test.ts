import { describe, expect, it, vi } from "vitest"

import {
  OPTIZMO_SYNC_JOB_NAME,
  OPTIZMO_SYNC_JOB_OPTIONS,
  OPTIZMO_SYNC_WORKER_CONCURRENCY,
  createEnqueueOptizmoSync,
  enqueueOptizmoSyncJob,
  optizmoSyncJobId,
} from "./optizmo-queue.js"

const OFFER_ID = "019a0000-0000-7000-8000-0000000000aa"
const REQUEST_ID = "019a0000-0000-7000-8000-0000000000ff"

describe("optizmo-queue", () => {
  it("builds daily job ids and caps concurrency at 3", () => {
    expect(optizmoSyncJobId(OFFER_ID, "2026-11-17")).toBe(
      `optizmo:${OFFER_ID}:2026-11-17`
    )
    expect(optizmoSyncJobId(OFFER_ID)).toMatch(
      new RegExp(`^optizmo:${OFFER_ID}:\\d{4}-\\d{2}-\\d{2}$`)
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
        requestId: REQUEST_ID,
        now: new Date("2026-11-17T08:00:00.000Z"),
      }
    )
    expect(add).toHaveBeenCalledWith(
      OPTIZMO_SYNC_JOB_NAME,
      expect.objectContaining({
        offer_id: OFFER_ID,
        trigger: "manual",
        request_id: REQUEST_ID,
      }),
      expect.objectContaining({
        jobId: `optizmo:${OFFER_ID}:2026-11-17`,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      })
    )
  })

  it("defaults trigger to manual and skips invalid request ids", async () => {
    const add = vi.fn(async () => undefined)
    await enqueueOptizmoSyncJob(
      { add, getJob: vi.fn() },
      {
        offerId: OFFER_ID,
        requestId: "   ",
        now: new Date("2026-11-17T08:00:00.000Z"),
      }
    )
    expect(add.mock.calls[0]?.[1]).toEqual({
      offer_id: OFFER_ID,
      trigger: "manual",
    })
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

  it("rethrows non-duplicate enqueue failures", async () => {
    const add = vi.fn(async () => {
      throw new Error("redis down")
    })
    await expect(
      enqueueOptizmoSyncJob(
        { add, getJob: vi.fn() },
        { offerId: OFFER_ID, now: new Date("2026-11-17T08:00:00.000Z") }
      )
    ).rejects.toThrow("redis down")
  })

  it("binds createEnqueueOptizmoSync to a queue", async () => {
    const add = vi.fn(async () => undefined)
    const enqueue = createEnqueueOptizmoSync({ add, getJob: vi.fn() })
    await enqueue({
      offerId: OFFER_ID,
      trigger: "scheduled",
      now: new Date("2026-11-17T08:00:00.000Z"),
    })
    expect(add).toHaveBeenCalledWith(
      OPTIZMO_SYNC_JOB_NAME,
      expect.objectContaining({ trigger: "scheduled" }),
      expect.objectContaining({ jobId: `optizmo:${OFFER_ID}:2026-11-17` })
    )
  })
})
