import type { JobsOptions } from "bullmq"

export const BLOCKLIST_CHECK_JOB_NAME = "blocklist-check"
export const BLOCKLIST_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
export const BLOCKLIST_CHECK_LOOKUP_TIMEOUT_MS = 5_000

export type BlocklistCheckJobData = {
  request_id?: string
}

export const BLOCKLIST_CHECK_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: "fixed" as const, delay: 60_000 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions
