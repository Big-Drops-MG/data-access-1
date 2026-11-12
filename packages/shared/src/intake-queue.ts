import type { JobsOptions } from "bullmq"

export const INTAKE_QUEUE_NAME = "intake"
export const IMAP_INTAKE_JOB_NAME = "imap-intake"

/** Scheduler defaults for imap-intake (SD#8.3). */
export const IMAP_INTAKE_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions
