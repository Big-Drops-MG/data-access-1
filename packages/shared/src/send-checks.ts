import {
  frequencyRule,
  message,
  recipientPreference,
  suppressionEntry,
  template,
  templateVersion,
} from "@workspace/db"
import type { Message, Recipient } from "@workspace/db"
import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm"

import { AppError } from "./errors.js"
import type { EmailHubTx, TriggerEmailType } from "./trigger-email.js"

/** Schema / SD#7 Stage A skip reasons (excludes `no_route`, handled earlier). */
export type SendCheckSkipReason =
  | "recipient_bounced"
  | "suppressed"
  | "opted_out"
  | "not_premium"
  | "collision"
  | "frequency_cap"

export type SendCheckFacts = {
  emailType: TriggerEmailType
  recipientStatus: Recipient["status"]
  recipientTier: Recipient["tier"]
  /** Active hard_bounce or feedback_review suppression. */
  hardOrComplaintSuppressed: boolean
  /** Active Optizmo / list_unsub / manual / offer suppression. */
  engagementSuppressed: boolean
  categoryOptedOut: boolean
  collisionHit: boolean
  frequencyCapHit: boolean
}

const TRANSACTIONAL_TYPES = new Set<TriggerEmailType>([
  "thank_you",
  "feedback_request",
])

type SuppressionSource =
  "optizmo" | "list_unsub" | "feedback_review" | "manual" | "hard_bounce"

const HARD_OR_COMPLAINT_SOURCES: readonly SuppressionSource[] = [
  "hard_bounce",
  "feedback_review",
]
const ENGAGEMENT_SUPPRESSION_SOURCES: readonly SuppressionSource[] = [
  "optizmo",
  "list_unsub",
  "manual",
]

export function isTransactionalEmailType(emailType: TriggerEmailType): boolean {
  return TRANSACTIONAL_TYPES.has(emailType)
}

/**
 * SD#7 Stage A step 7 — first failing check wins.
 * Thank-you / feedback_request ignore engagement suppressions and opt-outs.
 */
export function firstFailedSendCheck(
  facts: SendCheckFacts
): SendCheckSkipReason | null {
  if (facts.recipientStatus !== "active") {
    return "recipient_bounced"
  }

  if (facts.hardOrComplaintSuppressed) {
    return "suppressed"
  }

  const transactional = isTransactionalEmailType(facts.emailType)

  if (!transactional && facts.engagementSuppressed) {
    return "suppressed"
  }

  if (!transactional && facts.categoryOptedOut) {
    return "opted_out"
  }

  if (
    facts.emailType === "feedback_request" &&
    facts.recipientTier !== "premium"
  ) {
    return "not_premium"
  }

  if (facts.emailType === "feedback_request" && facts.collisionHit) {
    return "collision"
  }

  if (facts.frequencyCapHit) {
    return "frequency_cap"
  }

  return null
}

export type RunSendChecksInput = {
  recipient: Recipient
  emailType: TriggerEmailType
  offerId: string | null
  categoryId: string
  now?: Date
}

/**
 * Load check facts from the DB and return the first Stage A skip reason, or null.
 */
export async function runSendChecks(
  tx: EmailHubTx,
  input: RunSendChecksInput
): Promise<SendCheckSkipReason | null> {
  const now = input.now ?? new Date()
  const facts = await gatherSendCheckFacts(tx, input, now)
  return firstFailedSendCheck(facts)
}

export async function gatherSendCheckFacts(
  tx: EmailHubTx,
  input: RunSendChecksInput,
  now: Date
): Promise<SendCheckFacts> {
  const emailHash = input.recipient.emailHash
  const transactional = isTransactionalEmailType(input.emailType)

  const hardOrComplaintSuppressed = await hasActiveSuppression(
    tx,
    emailHash,
    HARD_OR_COMPLAINT_SOURCES
  )
  const engagementSuppressed = transactional
    ? false
    : await hasEngagementSuppression(tx, emailHash, input.offerId)
  const categoryOptedOut = transactional
    ? false
    : await hasCategoryOptOut(tx, input.recipient.id, input.categoryId)

  let collisionHit = false
  if (input.emailType === "feedback_request") {
    collisionHit = await hasCollision(
      tx,
      input.recipient.id,
      input.categoryId,
      now
    )
  }

  const frequencyCapHit = await isOverFrequencyCap(
    tx,
    input.recipient.id,
    input.emailType,
    input.categoryId,
    now
  )

  return {
    emailType: input.emailType,
    recipientStatus: input.recipient.status,
    recipientTier: input.recipient.tier,
    hardOrComplaintSuppressed,
    engagementSuppressed,
    categoryOptedOut,
    collisionHit,
    frequencyCapHit,
  }
}

async function hasActiveSuppression(
  tx: EmailHubTx,
  emailHash: string,
  sources: readonly SuppressionSource[]
): Promise<boolean> {
  const [row] = await tx
    .select({ id: suppressionEntry.id })
    .from(suppressionEntry)
    .where(
      and(
        eq(suppressionEntry.emailHash, emailHash),
        isNull(suppressionEntry.removedAt),
        inArray(suppressionEntry.source, sources)
      )
    )
    .limit(1)

  return row !== undefined
}

async function hasEngagementSuppression(
  tx: EmailHubTx,
  emailHash: string,
  offerId: string | null
): Promise<boolean> {
  const scopeMatch =
    offerId === null
      ? or(
          eq(suppressionEntry.scope, "global"),
          eq(suppressionEntry.scope, "list_unsub")
        )
      : or(
          eq(suppressionEntry.scope, "global"),
          eq(suppressionEntry.scope, "list_unsub"),
          and(
            eq(suppressionEntry.scope, "offer"),
            eq(suppressionEntry.offerId, offerId)
          )
        )

  const [row] = await tx
    .select({ id: suppressionEntry.id })
    .from(suppressionEntry)
    .where(
      and(
        eq(suppressionEntry.emailHash, emailHash),
        isNull(suppressionEntry.removedAt),
        inArray(suppressionEntry.source, ENGAGEMENT_SUPPRESSION_SOURCES),
        scopeMatch
      )
    )
    .limit(1)

  return row !== undefined
}

async function hasCategoryOptOut(
  tx: EmailHubTx,
  recipientId: string,
  categoryId: string
): Promise<boolean> {
  const [row] = await tx
    .select({ id: recipientPreference.id })
    .from(recipientPreference)
    .where(
      and(
        eq(recipientPreference.recipientId, recipientId),
        eq(recipientPreference.categoryId, categoryId),
        eq(recipientPreference.optedOut, true)
      )
    )
    .limit(1)

  return row !== undefined
}

async function resolveCollisionRule(
  tx: EmailHubTx,
  categoryId: string
): Promise<{ blocksWithType: TriggerEmailType; minGapHours: number } | null> {
  const [categoryRule] = await tx
    .select()
    .from(frequencyRule)
    .where(
      and(
        eq(frequencyRule.kind, "collision"),
        eq(frequencyRule.categoryId, categoryId)
      )
    )
    .limit(1)

  if (
    categoryRule?.blocksWithType != null &&
    categoryRule.minGapHours != null
  ) {
    return {
      blocksWithType: categoryRule.blocksWithType,
      minGapHours: categoryRule.minGapHours,
    }
  }

  const [globalRule] = await tx
    .select()
    .from(frequencyRule)
    .where(
      and(eq(frequencyRule.kind, "collision"), isNull(frequencyRule.categoryId))
    )
    .limit(1)

  if (globalRule?.blocksWithType != null && globalRule.minGapHours != null) {
    return {
      blocksWithType: globalRule.blocksWithType,
      minGapHours: globalRule.minGapHours,
    }
  }

  return null
}

async function hasCollision(
  tx: EmailHubTx,
  recipientId: string,
  categoryId: string,
  now: Date
): Promise<boolean> {
  const rule = await resolveCollisionRule(tx, categoryId)
  if (!rule) {
    return false
  }

  const since = new Date(now.getTime() - rule.minGapHours * 60 * 60 * 1000)
  const [row] = await tx
    .select({ id: message.id })
    .from(message)
    .where(
      and(
        eq(message.recipientId, recipientId),
        eq(message.emailType, rule.blocksWithType),
        ne(message.status, "skipped"),
        gte(message.createdAt, since)
      )
    )
    .limit(1)

  return row !== undefined
}

async function resolveCapRule(
  tx: EmailHubTx,
  categoryId: string
): Promise<{ maxCount: number; windowDays: number } | null> {
  const [categoryRule] = await tx
    .select()
    .from(frequencyRule)
    .where(
      and(
        eq(frequencyRule.kind, "cap"),
        eq(frequencyRule.categoryId, categoryId)
      )
    )
    .limit(1)

  if (categoryRule?.maxCount != null && categoryRule.windowDays != null) {
    return {
      maxCount: categoryRule.maxCount,
      windowDays: categoryRule.windowDays,
    }
  }

  const [globalRule] = await tx
    .select()
    .from(frequencyRule)
    .where(and(eq(frequencyRule.kind, "cap"), isNull(frequencyRule.categoryId)))
    .limit(1)

  if (globalRule?.maxCount != null && globalRule.windowDays != null) {
    return {
      maxCount: globalRule.maxCount,
      windowDays: globalRule.windowDays,
    }
  }

  return null
}

async function isOverFrequencyCap(
  tx: EmailHubTx,
  recipientId: string,
  emailType: TriggerEmailType,
  categoryId: string,
  now: Date
): Promise<boolean> {
  const rule = await resolveCapRule(tx, categoryId)
  if (!rule) {
    return false
  }

  const since = new Date(now.getTime() - rule.windowDays * 24 * 60 * 60 * 1000)
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(message)
    .leftJoin(
      templateVersion,
      eq(message.templateVersionId, templateVersion.id)
    )
    .leftJoin(template, eq(templateVersion.templateId, template.id))
    .where(
      and(
        eq(message.recipientId, recipientId),
        ne(message.status, "skipped"),
        gte(message.createdAt, since),
        or(
          eq(message.emailType, emailType),
          eq(template.categoryId, categoryId)
        )
      )
    )

  return Number(row?.count ?? 0) >= rule.maxCount
}

export async function insertSkippedSendCheckMessage(
  tx: EmailHubTx,
  input: {
    recipientId: string
    emailType: TriggerEmailType
    offerId: string | null
    idempotencyKey: string
    templateVersionId: string
    senderId: string
    skipReason: SendCheckSkipReason
  }
): Promise<Message> {
  const [skipped] = await tx
    .insert(message)
    .values({
      recipientId: input.recipientId,
      offerId: input.offerId,
      emailType: input.emailType,
      templateVersionId: input.templateVersionId,
      senderId: input.senderId,
      idempotencyKey: input.idempotencyKey,
      status: "skipped",
      skipReason: input.skipReason,
    })
    .returning()

  if (!skipped) {
    throw new AppError("internal")
  }

  return skipped
}
