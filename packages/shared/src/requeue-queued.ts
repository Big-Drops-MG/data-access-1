import { message } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import type { Queue } from "bullmq"
import { asc, eq } from "drizzle-orm"

import { isDuplicateBullmqJob } from "./dispatch-queue.js"
import {
  enqueueSendEmailJob,
  type SendEmailJobData,
} from "./send-email-queue.js"

export type RequeueQueuedResult = {
  scanned: number
  enqueued: number
  already_present: number
}

type SendEmailQueue = Pick<Queue<SendEmailJobData>, "add">

const PAGE_SIZE = 500

export async function requeueQueuedMessages(
  db: Database,
  queue: SendEmailQueue
): Promise<RequeueQueuedResult> {
  let scanned = 0
  let enqueued = 0
  let alreadyPresent = 0
  let offset = 0

  for (;;) {
    const rows = await db
      .select({
        id: message.id,
        environment: message.environment,
      })
      .from(message)
      .where(eq(message.status, "queued"))
      .orderBy(asc(message.id))
      .limit(PAGE_SIZE)
      .offset(offset)

    if (rows.length === 0) {
      break
    }

    for (const row of rows) {
      scanned += 1
      try {
        await enqueueSendEmailJob(
          queue,
          row.id,
          undefined,
          row.environment === "test" || row.environment === "production"
            ? row.environment
            : undefined
        )
        enqueued += 1
      } catch (error) {
        if (!isDuplicateBullmqJob(error)) {
          throw error
        }
        alreadyPresent += 1
      }
    }

    if (rows.length < PAGE_SIZE) {
      break
    }
    offset += rows.length
  }

  return {
    scanned,
    enqueued,
    already_present: alreadyPresent,
  }
}
