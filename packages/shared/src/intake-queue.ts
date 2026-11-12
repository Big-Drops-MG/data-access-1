import { getRequestId, isValidRequestId } from "@workspace/logger"
import type { JobsOptions, Queue } from "bullmq"

import { isDuplicateBullmqJob } from "./dispatch-queue.js"

export const INTAKE_QUEUE_NAME = "intake"
export const CSV_INGEST_JOB_NAME = "csv-ingest"
export const IMAP_INTAKE_JOB_NAME = "imap-intake"

export type CsvIngestJobData = {
  upload_id: string
  file_path: string
  request_id?: string
  actor_user_id?: string
}

/** csv-ingest: single attempt, no auto retry (SD#8.3). */
export const CSV_INGEST_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

/** Scheduler defaults for imap-intake (SD#8.3). */
export const IMAP_INTAKE_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

export function csvIngestJobId(uploadId: string): string {
  return `csv:${uploadId}`
}

type IntakeQueue = Pick<Queue<CsvIngestJobData>, "add" | "getJob">

export async function enqueueCsvIngestJob(
  queue: IntakeQueue,
  data: CsvIngestJobData
): Promise<void> {
  const payload: CsvIngestJobData = {
    upload_id: data.upload_id,
    file_path: data.file_path,
  }
  if (data.actor_user_id) {
    payload.actor_user_id = data.actor_user_id
  }
  const resolved = data.request_id?.trim() || getRequestId()
  if (resolved && isValidRequestId(resolved)) {
    payload.request_id = resolved
  }

  const jobId = csvIngestJobId(data.upload_id)
  try {
    await queue.add(CSV_INGEST_JOB_NAME, payload, {
      jobId,
      ...CSV_INGEST_JOB_OPTIONS,
    })
  } catch (error) {
    if (!isDuplicateBullmqJob(error)) {
      throw error
    }
  }
}
