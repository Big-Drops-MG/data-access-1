import { describe, expect, it, vi } from "vitest"

import {
  EVENTS_JOB_NAME,
  EVENTS_JOB_OPTIONS,
  EVENTS_QUEUE_NAME,
  enqueueEventsJob,
  type EventsJobData,
} from "./events-queue.js"

const jobData: EventsJobData = {
  sns_message_id: "4f3a6d5c-1b2e-4a9f-8c7d-6e5f4a3b2c1d",
  records: [],
}

describe("events queue helpers", () => {
  it("uses the events queue, events-writer job, and ten exponential attempts", () => {
    expect(EVENTS_QUEUE_NAME).toBe("events")
    expect(EVENTS_JOB_NAME).toBe("events-writer")
    expect(EVENTS_JOB_OPTIONS.attempts).toBe(10)
    expect(EVENTS_JOB_OPTIONS.backoff).toEqual({
      type: "exponential",
      delay: 5_000,
    })
  })

  it("enqueues with jobId equal to sns_message_id", async () => {
    const add = vi.fn(async () => undefined)

    await enqueueEventsJob({ add }, jobData)

    expect(add).toHaveBeenCalledWith(EVENTS_JOB_NAME, jobData, {
      jobId: jobData.sns_message_id,
      ...EVENTS_JOB_OPTIONS,
    })
  })
})
