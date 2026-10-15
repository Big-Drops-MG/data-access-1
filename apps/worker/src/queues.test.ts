import { describe, expect, it } from "vitest"

import { BULLMQ_PREFIX, QUEUE_NAMES } from "./queues.js"

describe("worker queues", () => {
  it("uses the bd BullMQ prefix", () => {
    expect(BULLMQ_PREFIX).toBe("bd")
  })

  it("registers the expected queue names", () => {
    expect(QUEUE_NAMES).toEqual([
      "send-email",
      "dispatch",
      "events",
      "sync",
      "monitoring",
      "intake",
      "maintenance",
    ])
  })
})
