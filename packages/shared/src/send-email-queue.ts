import type { JobsOptions, Queue } from "bullmq"

/** BullMQ key prefix (SD#15.5 / queue map). */
export const BULLMQ_PREFIX = "bd"

export const SEND_EMAIL_QUEUE_NAME = "send-email"
export const SEND_EMAIL_JOB_NAME = "send-email"

export type SendEmailJobData = {
  message_id: string
}

/** Default options for send-email jobs (SD#15.5 job map). */
export const SEND_EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

type SendEmailQueue = Pick<Queue<SendEmailJobData>, "add">

/**
 * Enqueue Stage B for a committed queued message.
 * `jobId` equals `message_id` so retries and the watchdog are idempotent.
 */
export async function enqueueSendEmailJob(
  queue: SendEmailQueue,
  messageId: string
): Promise<void> {
  await queue.add(
    SEND_EMAIL_JOB_NAME,
    { message_id: messageId },
    {
      jobId: messageId,
      ...SEND_EMAIL_JOB_OPTIONS,
    }
  )
}

/** Build the `enqueueSendEmail` dep for `triggerEmail` from a BullMQ queue. */
export function createEnqueueSendEmail(
  queue: SendEmailQueue
): (messageId: string) => Promise<void> {
  return (messageId) => enqueueSendEmailJob(queue, messageId)
}
