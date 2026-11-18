import { Queue } from "bullmq"

import {
  AppError,
  BULLMQ_PREFIX,
  MONITORING_QUEUE_NAME,
  type DnsCheckJobData,
} from "@workspace/shared"

let queue: Queue<DnsCheckJobData> | undefined

export function getMonitoringQueue(): Queue<DnsCheckJobData> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw AppError.unavailable([
      { path: "queue", message: "Monitoring queue unavailable" },
    ])
  }

  if (!queue) {
    queue = new Queue<DnsCheckJobData>(MONITORING_QUEUE_NAME, {
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
