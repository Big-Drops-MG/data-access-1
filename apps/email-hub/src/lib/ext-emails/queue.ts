import { Queue } from "bullmq"

import {
  AppError,
  BULLMQ_PREFIX,
  SEND_EMAIL_QUEUE_NAME,
  type SendEmailJobData,
} from "@workspace/shared"

let queue: Queue<SendEmailJobData> | undefined

/**
 * Producer for the existing `send-email` queue.
 * BullMQ reads `url` itself. A short connect timeout fails the request
 * instead of hanging while Redis is down.
 */
export function getSendEmailQueue(): Queue<SendEmailJobData> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw AppError.unavailable([
      { path: "queue", message: "Send queue unavailable" },
    ])
  }

  if (!queue) {
    queue = new Queue<SendEmailJobData>(SEND_EMAIL_QUEUE_NAME, {
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
