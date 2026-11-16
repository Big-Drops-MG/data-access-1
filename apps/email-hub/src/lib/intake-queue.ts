import { Queue } from "bullmq"

import {
  AppError,
  BULLMQ_PREFIX,
  INTAKE_QUEUE_NAME,
  type CsvIngestJobData,
} from "@workspace/shared"

let queue: Queue<CsvIngestJobData> | undefined

/** Producer for the `intake` queue (csv-ingest). */
export function getIntakeQueue(): Queue<CsvIngestJobData> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw AppError.unavailable([
      { path: "queue", message: "Intake queue unavailable" },
    ])
  }

  if (!queue) {
    queue = new Queue<CsvIngestJobData>(INTAKE_QUEUE_NAME, {
      connection: {
        url: redisUrl,
        maxRetriesPerRequest: 1,
        connectTimeout: 2_000,
      },
      prefix: BULLMQ_PREFIX,
    })
  }

  return queue
}
