import { getRequestId, isValidRequestId } from "@workspace/logger"
import type { JobsOptions, Queue } from "bullmq"

import { isDuplicateBullmqJob } from "./dispatch-queue.js"
import { formatEtDate } from "./time.js"
import { uuidSchema } from "./schemas.js"

export const SYNC_QUEUE_NAME = "sync"
export const OPTIZMO_SYNC_JOB_NAME = "optizmo-sync"
export const OPTIZMO_SYNC_WORKER_CONCURRENCY = 3

export type OptizmoSyncTrigger = "scheduled" | "manual"

export type OptizmoSyncJobData = {
  offer_id?: string
  trigger?: OptizmoSyncTrigger
  request_id?: string
}

export const OPTIZMO_SYNC_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 60_000 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

export function optizmoSyncJobId(
  offerId: string,
  day: string = formatEtDate(new Date())
): string {
  return `optizmo:${offerId}:${day}`
}

type SyncQueue = Pick<Queue<OptizmoSyncJobData>, "add" | "getJob">

export async function enqueueOptizmoSyncJob(
  queue: SyncQueue,
  input: {
    offerId: string
    trigger?: OptizmoSyncTrigger
    requestId?: string
    now?: Date
  }
): Promise<void> {
  const offerId = uuidSchema.parse(input.offerId)
  const trigger = input.trigger ?? "manual"
  const payload: OptizmoSyncJobData = {
    offer_id: offerId,
    trigger,
  }
  const resolved = input.requestId?.trim() || getRequestId()
  if (resolved && isValidRequestId(resolved)) {
    payload.request_id = resolved
  }

  const jobId = optizmoSyncJobId(offerId, formatEtDate(input.now ?? new Date()))
  try {
    await queue.add(OPTIZMO_SYNC_JOB_NAME, payload, {
      jobId,
      ...OPTIZMO_SYNC_JOB_OPTIONS,
    })
  } catch (error) {
    if (!isDuplicateBullmqJob(error)) {
      throw error
    }
  }
}

export function createEnqueueOptizmoSync(
  queue: SyncQueue
): (input: {
  offerId: string
  trigger?: OptizmoSyncTrigger
  requestId?: string
  now?: Date
}) => Promise<void> {
  return (input) => enqueueOptizmoSyncJob(queue, input)
}
