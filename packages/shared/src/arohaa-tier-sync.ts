import { recipient, type Recipient } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { getContextLogger, maskEmail } from "@workspace/logger"
import { eq } from "drizzle-orm"

import type {
  ArohaaTierSyncJobData,
  RecipientTierValue,
} from "./arohaa-queue.js"
import { arohaaTierSyncJobId } from "./arohaa-queue.js"
import { recordIntegrationResult } from "./integration-sync-state.js"
import { emailSchema, isoUtcTimestampSchema } from "./schemas.js"
import {
  findOrCreateRecipient,
  triggerEmail,
  type TriggerEmailDeps,
  type TriggerEmailResult,
} from "./trigger-email.js"

export const AROHAA_WEBHOOK_INTEGRATION_NAME = "arohaa_webhook" as const

export type ProcessArohaaTierSyncDeps = {
  db: Database
  enqueueSendEmail: TriggerEmailDeps["enqueueSendEmail"]
}

export type ArohaaTierSyncResult =
  | { kind: "unchanged"; recipient: Recipient }
  | {
      kind: "updated"
      recipient: Recipient
      previousTier: RecipientTierValue
      email?: TriggerEmailResult
    }

function parseOccurredAt(value: string): Date {
  const parsed = isoUtcTimestampSchema.safeParse(value)
  if (!parsed.success) {
    return new Date()
  }
  return new Date(parsed.data)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return "arohaa tier sync failed"
}

export async function processArohaaTierSyncJob(
  data: ArohaaTierSyncJobData,
  deps: ProcessArohaaTierSyncDeps
): Promise<ArohaaTierSyncResult> {
  const email = emailSchema.parse(data.email)
  const tier = data.tier
  const occurredAt = parseOccurredAt(data.occurred_at)
  const log = getContextLogger().child({
    event_name: "arohaa.tier_sync",
    arohaa_event_id: data.arohaa_event_id,
    email_masked: maskEmail(email),
    tier,
  })

  try {
    const current = await findOrCreateRecipient(deps.db, email)
    if (current.tier === tier) {
      log.info(
        { event: "arohaa.tier_sync.unchanged", recipient_id: current.id },
        "Arohaa tier unchanged"
      )
      await recordIntegrationResult(deps.db, {
        name: AROHAA_WEBHOOK_INTEGRATION_NAME,
        ok: true,
      })
      return { kind: "unchanged", recipient: current }
    }

    const previousTier = current.tier
    const [updated] = await deps.db
      .update(recipient)
      .set({
        tier,
        tierUpdatedAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(recipient.id, current.id))
      .returning()

    const next = updated ?? { ...current, tier, tierUpdatedAt: occurredAt }

    log.info(
      {
        event: "arohaa.tier_sync.updated",
        recipient_id: next.id,
        previous_tier: previousTier,
      },
      "Arohaa recipient tier updated"
    )

    if (tier !== "premium") {
      await recordIntegrationResult(deps.db, {
        name: AROHAA_WEBHOOK_INTEGRATION_NAME,
        ok: true,
      })
      return { kind: "updated", recipient: next, previousTier }
    }

    const emailResult = await triggerEmail(
      deps.db,
      {
        email,
        emailType: "feedback_request",
        idempotencyKey: arohaaTierSyncJobId(data.arohaa_event_id),
        offerId: null,
        requestId: data.request_id ?? null,
      },
      { enqueueSendEmail: deps.enqueueSendEmail }
    )

    log.info(
      {
        event: "arohaa.tier_sync.feedback_request",
        recipient_id: next.id,
        message_id: emailResult.message.id,
        created: emailResult.created,
        status: emailResult.message.status,
      },
      "Arohaa premium feedback_request triggered"
    )

    await recordIntegrationResult(deps.db, {
      name: AROHAA_WEBHOOK_INTEGRATION_NAME,
      ok: true,
    })

    return {
      kind: "updated",
      recipient: next,
      previousTier,
      email: emailResult,
    }
  } catch (error) {
    await recordIntegrationResult(deps.db, {
      name: AROHAA_WEBHOOK_INTEGRATION_NAME,
      ok: false,
      error: errorMessage(error),
    }).catch(() => undefined)
    throw error
  }
}
