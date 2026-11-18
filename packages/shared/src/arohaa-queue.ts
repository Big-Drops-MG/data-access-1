import { getRequestId, isValidRequestId } from "@workspace/logger"
import type { JobsOptions } from "bullmq"

import { isDuplicateBullmqJob } from "./dispatch-queue.js"

export const AROHAA_TIER_SYNC_JOB_NAME = "arohaa-tier-sync"

export const RECIPIENT_TIERS = ["standard", "premium"] as const
export type RecipientTierValue = (typeof RECIPIENT_TIERS)[number]

export type ArohaaTierSyncJobData = {
  arohaa_event_id: string
  email: string
  tier: RecipientTierValue
  previous_tier?: RecipientTierValue
  occurred_at: string
  request_id?: string
}

export const AROHAA_TIER_SYNC_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

export function arohaaTierSyncJobId(eventId: string): string {
  return `tier-${eventId}`
}

type SyncQueue = {
  add: (
    name: string,
    data: ArohaaTierSyncJobData,
    opts?: JobsOptions
  ) => Promise<unknown>
  getJob: (jobId: string) => Promise<unknown>
}

export async function enqueueArohaaTierSyncJob(
  queue: SyncQueue,
  input: {
    eventId: string
    email: string
    tier: RecipientTierValue
    previousTier?: RecipientTierValue
    occurredAt: string
    requestId?: string
  }
): Promise<"queued" | "duplicate"> {
  const payload: ArohaaTierSyncJobData = {
    arohaa_event_id: input.eventId,
    email: input.email,
    tier: input.tier,
    occurred_at: input.occurredAt,
  }
  if (input.previousTier) {
    payload.previous_tier = input.previousTier
  }
  const resolved = input.requestId?.trim() || getRequestId()
  if (resolved && isValidRequestId(resolved)) {
    payload.request_id = resolved
  }

  const jobId = arohaaTierSyncJobId(input.eventId)
  try {
    await queue.add(AROHAA_TIER_SYNC_JOB_NAME, payload, {
      jobId,
      ...AROHAA_TIER_SYNC_JOB_OPTIONS,
    })
    return "queued"
  } catch (error) {
    if (isDuplicateBullmqJob(error)) {
      return "duplicate"
    }
    throw error
  }
}

export function createEnqueueArohaaTierSync(
  queue: SyncQueue
): (input: {
  eventId: string
  email: string
  tier: RecipientTierValue
  previousTier?: RecipientTierValue
  occurredAt: string
  requestId?: string
}) => Promise<"queued" | "duplicate"> {
  return (input) => enqueueArohaaTierSyncJob(queue, input)
}
