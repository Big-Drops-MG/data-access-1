import { describe, expect, it } from "vitest"

import {
  BLOCKLIST_CHECK_INTERVAL_MS,
  BLOCKLIST_CHECK_JOB_NAME,
  BLOCKLIST_CHECK_JOB_OPTIONS,
  BLOCKLIST_CHECK_LOOKUP_TIMEOUT_MS,
} from "./blocklist-check-queue.js"

describe("blocklist-check-queue", () => {
  it("matches SD#8 monitoring job contract", () => {
    expect(BLOCKLIST_CHECK_JOB_NAME).toBe("blocklist-check")
    expect(BLOCKLIST_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000)
    expect(BLOCKLIST_CHECK_LOOKUP_TIMEOUT_MS).toBe(5_000)
    expect(BLOCKLIST_CHECK_JOB_OPTIONS).toMatchObject({
      attempts: 2,
      backoff: { type: "fixed", delay: 60_000 },
    })
  })
})
