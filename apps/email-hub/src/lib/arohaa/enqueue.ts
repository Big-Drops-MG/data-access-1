import {
  AppError,
  enqueueArohaaTierSyncJob,
  type RecipientTierValue,
} from "@workspace/shared"

import { getSyncQueue } from "@/lib/sync-queue"

export async function enqueueArohaaTierWebhook(input: {
  eventId: string
  email: string
  tier: RecipientTierValue
  previousTier?: RecipientTierValue
  occurredAt: string
  requestId?: string
}): Promise<"queued" | "duplicate"> {
  try {
    return await enqueueArohaaTierSyncJob(getSyncQueue(), input)
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    throw AppError.unavailable([
      { path: "queue", message: "Sync queue unavailable" },
    ])
  }
}
