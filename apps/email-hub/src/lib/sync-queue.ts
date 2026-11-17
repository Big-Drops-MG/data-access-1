import { Queue } from "bullmq"

import {
  AppError,
  BULLMQ_PREFIX,
  SYNC_QUEUE_NAME,
  type OptizmoSyncJobData,
} from "@workspace/shared"

let queue: Queue<OptizmoSyncJobData> | undefined

export function getSyncQueue(): Queue<OptizmoSyncJobData> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw AppError.unavailable([
      { path: "queue", message: "Sync queue unavailable" },
    ])
  }

  if (!queue) {
    queue = new Queue<OptizmoSyncJobData>(SYNC_QUEUE_NAME, {
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
