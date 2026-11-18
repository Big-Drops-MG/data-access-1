import { Queue } from "bullmq"

import {
  AppError,
  BULLMQ_PREFIX,
  SYNC_QUEUE_NAME,
  type ArohaaTierSyncJobData,
  type OptizmoSyncJobData,
} from "@workspace/shared"

export type SyncQueueJobData = OptizmoSyncJobData | ArohaaTierSyncJobData

let queue: Queue<SyncQueueJobData> | undefined

export function getSyncQueue(): Queue<SyncQueueJobData> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw AppError.unavailable([
      { path: "queue", message: "Sync queue unavailable" },
    ])
  }

  if (!queue) {
    queue = new Queue<SyncQueueJobData>(SYNC_QUEUE_NAME, {
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
