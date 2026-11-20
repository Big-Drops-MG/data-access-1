import { Queue } from "bullmq"

import { getDb, getPool } from "@workspace/db/client"

import { isAppError } from "./errors.js"
import { requeueQueuedMessages } from "./requeue-queued.js"
import { BULLMQ_PREFIX, SEND_EMAIL_QUEUE_NAME } from "./send-email-queue.js"

function requireRedisUrl(): string {
  const url = process.env.REDIS_URL?.trim()
  if (!url) {
    throw new Error("REDIS_URL is required")
  }
  return url
}

const redisUrl = requireRedisUrl()
const queue = new Queue(SEND_EMAIL_QUEUE_NAME, {
  connection: { url: redisUrl, maxRetriesPerRequest: null },
  prefix: BULLMQ_PREFIX,
})

try {
  const result = await requeueQueuedMessages(getDb(), queue)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) {
  if (isAppError(error)) {
    process.stderr.write(`${error.message}\n`)
  } else {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
  }
  process.exitCode = 1
} finally {
  await queue.close()
  await getPool().end()
}
