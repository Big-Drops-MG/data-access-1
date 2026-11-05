import { getRequestId, isValidRequestId } from "@workspace/logger"
import type { JobsOptions, Queue } from "bullmq"

import { BULLMQ_PREFIX } from "./send-email-queue.js"

export { BULLMQ_PREFIX }

export const DISPATCH_QUEUE_NAME = "dispatch"
export const SCHEDULE_PROMOTER_JOB_NAME = "schedule-promoter"
export const DISPATCH_SEND_JOB_NAME = "dispatch-send"

export type DispatchSendJobData = {
  send_id: string
  request_id?: string
}

export const DISPATCH_SEND_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 30_000 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

export const SEND_LATE_THRESHOLD_MS = 15 * 60 * 1000
export const SEND_LATE_ALERT_TYPE = "send_late"

export function sendLateAlertDedupeKey(sendId: string): string {
  return `send_late:${sendId}`
}

export function isSendLate(
  scheduledFor: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() - scheduledFor.getTime() > SEND_LATE_THRESHOLD_MS
}

type DispatchQueue = Pick<Queue<DispatchSendJobData>, "add" | "getJob">

export function isDuplicateBullmqJob(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.toLowerCase().includes("already exists") ||
      error.message.toLowerCase().includes("duplicated"))
  )
}

async function addDispatchSendJob(
  queue: DispatchQueue,
  data: DispatchSendJobData,
  sendId: string
): Promise<void> {
  await queue.add(DISPATCH_SEND_JOB_NAME, data, {
    jobId: sendId,
    ...DISPATCH_SEND_JOB_OPTIONS,
  })
}

export async function enqueueDispatchSendJob(
  queue: DispatchQueue,
  sendId: string,
  requestId?: string
): Promise<void> {
  const data: DispatchSendJobData = { send_id: sendId }
  const resolved = requestId?.trim() || getRequestId()
  if (resolved && isValidRequestId(resolved)) {
    data.request_id = resolved
  }

  try {
    await addDispatchSendJob(queue, data, sendId)
    return
  } catch (error) {
    if (!isDuplicateBullmqJob(error)) {
      throw error
    }
  }

  const existing = await queue.getJob(sendId)
  if (!existing) {
    return
  }
  const state = await existing.getState()
  if (state !== "failed") {
    return
  }
  await existing.remove()
  await addDispatchSendJob(queue, data, sendId)
}

export function createEnqueueDispatchSend(
  queue: DispatchQueue
): (sendId: string, requestId?: string) => Promise<void> {
  return (sendId, requestId) => enqueueDispatchSendJob(queue, sendId, requestId)
}
