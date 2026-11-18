import { describe, expect, it, vi } from "vitest"

import {
  AROHAA_TIER_SYNC_JOB_NAME,
  AROHAA_TIER_SYNC_JOB_OPTIONS,
  arohaaTierSyncJobId,
  createEnqueueArohaaTierSync,
  enqueueArohaaTierSyncJob,
} from "./arohaa-queue.js"

const EVENT_ID = "evt_01J9TESTEVENT"
const REQUEST_ID = "019a0000-0000-7000-8000-0000000000ff"

describe("arohaa-queue", () => {
  it("builds tier job ids and retry options", () => {
    expect(arohaaTierSyncJobId(EVENT_ID)).toBe(`tier:${EVENT_ID}`)
    expect(AROHAA_TIER_SYNC_JOB_OPTIONS.attempts).toBe(5)
    expect(AROHAA_TIER_SYNC_JOB_OPTIONS.backoff).toEqual({
      type: "exponential",
      delay: 5_000,
    })
  })

  it("enqueues arohaa-tier-sync with payload and jobId", async () => {
    const add = vi.fn(async () => undefined)
    const result = await enqueueArohaaTierSyncJob(
      { add, getJob: vi.fn() },
      {
        eventId: EVENT_ID,
        email: "jane@example.com",
        tier: "premium",
        previousTier: "standard",
        occurredAt: "2026-10-07T14:00:00.000Z",
        requestId: REQUEST_ID,
      }
    )
    expect(result).toBe("queued")
    expect(add).toHaveBeenCalledWith(
      AROHAA_TIER_SYNC_JOB_NAME,
      {
        arohaa_event_id: EVENT_ID,
        email: "jane@example.com",
        tier: "premium",
        previous_tier: "standard",
        occurred_at: "2026-10-07T14:00:00.000Z",
        request_id: REQUEST_ID,
      },
      expect.objectContaining({
        jobId: `tier:${EVENT_ID}`,
        attempts: 5,
      })
    )
  })

  it("treats duplicate job ids as a no-op enqueue", async () => {
    const add = vi.fn(async () => {
      throw new Error("Job tier:evt already exists")
    })
    await expect(
      enqueueArohaaTierSyncJob(
        { add, getJob: vi.fn() },
        {
          eventId: EVENT_ID,
          email: "jane@example.com",
          tier: "premium",
          occurredAt: "2026-10-07T14:00:00.000Z",
        }
      )
    ).resolves.toBe("duplicate")
  })

  it("binds createEnqueueArohaaTierSync to a queue", async () => {
    const add = vi.fn(async () => undefined)
    const enqueue = createEnqueueArohaaTierSync({ add, getJob: vi.fn() })
    await enqueue({
      eventId: EVENT_ID,
      email: "jane@example.com",
      tier: "standard",
      occurredAt: "2026-10-07T14:00:00.000Z",
    })
    expect(add).toHaveBeenCalledWith(
      AROHAA_TIER_SYNC_JOB_NAME,
      expect.objectContaining({ tier: "standard" }),
      expect.objectContaining({ jobId: `tier:${EVENT_ID}` })
    )
  })
})
