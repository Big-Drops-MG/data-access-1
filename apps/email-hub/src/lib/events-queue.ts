import { Queue } from "bullmq"

import {
  AppError,
  BULLMQ_PREFIX,
  EVENTS_QUEUE_NAME,
  type EventsJobData,
} from "@workspace/shared"

let queue: Queue<EventsJobData> | undefined

/**
 * Producer for the `events` queue (T-062).
 * BullMQ reads `url` itself. A short connect timeout fails the request
 * instead of hanging while Redis is down.
 */
export function getEventsQueue(): Queue<EventsJobData> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw AppError.unavailable([
      { path: "queue", message: "Events queue unavailable" },
    ])
  }

  if (!queue) {
    queue = new Queue<EventsJobData>(EVENTS_QUEUE_NAME, {
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
