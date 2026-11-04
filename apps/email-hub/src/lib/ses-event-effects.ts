import { createHash } from "node:crypto"

import { and, eq, inArray, sql } from "drizzle-orm"

import {
  feedbackItem,
  message,
  recipient,
  suppressionEntry,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { hashEmail, writeAudit } from "@workspace/shared"

export type SesMessageStatus =
  "sent" | "delivered" | "bounced" | "complained" | "failed"

const PRIOR_STATUSES: Record<SesMessageStatus, readonly string[]> = {
  sent: ["queued"],
  delivered: ["queued", "sent"],
  bounced: ["queued", "sent", "delivered"],
  complained: ["queued", "sent", "delivered"],
  failed: ["queued", "sent"],
}

/** Explicit soft / unknown bounce types — everything else on Bounce is hard. */
const SOFT_BOUNCE_TYPES = new Set(["transient", "undetermined"])

export type ParsedSesEvent = {
  eventType: string
  sesMessageId: string
  /** SES bounce.bounceType when present (Permanent / Transient / Undetermined). */
  bounceType: string | null
  /** Addresses from bounce/complaint recipients or mail.destination. */
  recipientEmails: string[]
}

export type SesMessageContext = {
  messageId: string | null
  recipientId: string | null
  emailHash: string
  recipientStatus: "active" | "bounced" | null
}

export function normalizeSesEventType(eventType: string): string {
  return eventType.toLowerCase().replace(/[\s_-]+/g, "")
}

/**
 * Permanent SES bounces, and Bounce events missing bounceType (incomplete
 * payloads / fixtures). Transient and Undetermined stay soft.
 */
export function isHardBounceEvent(event: ParsedSesEvent): boolean {
  if (normalizeSesEventType(event.eventType) !== "bounce") {
    return false
  }
  const bounceType = (event.bounceType ?? "").trim().toLowerCase()
  if (bounceType.length === 0) {
    return true
  }
  return !SOFT_BOUNCE_TYPES.has(bounceType)
}

export function isComplaintEvent(event: ParsedSesEvent): boolean {
  return normalizeSesEventType(event.eventType) === "complaint"
}

/** Unique key for feedback_item (SES message id + event type). */
export function feedbackDedupeHash(
  sesMessageId: string,
  eventType: string
): string {
  return createHash("sha256")
    .update(`${sesMessageId}\0${normalizeSesEventType(eventType)}`, "utf8")
    .digest("hex")
}

export async function lookupMessageBySesId(
  db: Database | DatabaseTransaction,
  sesMessageId: string
): Promise<SesMessageContext | null> {
  const [row] = await db
    .select({
      messageId: message.id,
      recipientId: message.recipientId,
      emailHash: recipient.emailHash,
      recipientStatus: recipient.status,
    })
    .from(message)
    .innerJoin(recipient, eq(message.recipientId, recipient.id))
    .where(eq(message.sesMessageId, sesMessageId))
    .limit(1)

  return row ?? null
}

async function lookupRecipientByEmail(
  db: Database | DatabaseTransaction,
  email: string
): Promise<SesMessageContext | null> {
  const emailHash = hashEmail(email)
  const [row] = await db
    .select({
      recipientId: recipient.id,
      emailHash: recipient.emailHash,
      recipientStatus: recipient.status,
    })
    .from(recipient)
    .where(eq(recipient.emailHash, emailHash))
    .limit(1)

  if (!row) {
    return null
  }

  return {
    messageId: null,
    recipientId: row.recipientId,
    emailHash: row.emailHash,
    recipientStatus: row.recipientStatus,
  }
}

async function resolveHardBounceContext(
  db: Database | DatabaseTransaction,
  event: ParsedSesEvent
): Promise<SesMessageContext | null> {
  const bySes = await lookupMessageBySesId(db, event.sesMessageId)
  if (bySes) {
    return bySes
  }

  for (const email of event.recipientEmails) {
    const byEmail = await lookupRecipientByEmail(db, email)
    if (byEmail) {
      return byEmail
    }
  }

  const firstEmail = event.recipientEmails[0]
  if (!firstEmail) {
    return null
  }

  return {
    messageId: null,
    recipientId: null,
    emailHash: hashEmail(firstEmail),
    recipientStatus: null,
  }
}

async function resolveComplaintContext(
  db: Database | DatabaseTransaction,
  event: ParsedSesEvent
): Promise<SesMessageContext> {
  const bySes = await lookupMessageBySesId(db, event.sesMessageId)
  if (bySes) {
    return bySes
  }

  for (const email of event.recipientEmails) {
    const byEmail = await lookupRecipientByEmail(db, email)
    if (byEmail) {
      return byEmail
    }
  }

  const firstEmail = event.recipientEmails[0]
  return {
    messageId: null,
    recipientId: null,
    emailHash: firstEmail ? hashEmail(firstEmail) : "",
    recipientStatus: null,
  }
}

/**
 * bounce_hard: recipient.status=bounced (when known), global hard_bounce
 * suppression, audit. Idempotent on the active global suppression unique index.
 */
export async function applyHardBounceEffects(
  db: Database | DatabaseTransaction,
  ctx: SesMessageContext
): Promise<void> {
  if (ctx.recipientId) {
    await db
      .update(recipient)
      .set({ status: "bounced", updatedAt: new Date() })
      .where(eq(recipient.id, ctx.recipientId))
  }

  await db
    .insert(suppressionEntry)
    .values({
      emailHash: ctx.emailHash,
      recipientId: ctx.recipientId,
      scope: "global",
      source: "hard_bounce",
      reason: "ses_bounce_permanent",
    })
    .onConflictDoNothing({
      target: [suppressionEntry.emailHash, suppressionEntry.scope],
      where: sql`${suppressionEntry.removedAt} IS NULL AND ${suppressionEntry.offerId} IS NULL`,
    })

  await writeAudit(db, {
    actor: { type: "system" },
    action: "recipient.hard_bounce",
    objectType: ctx.recipientId ? "recipient" : "suppression_entry",
    objectId: ctx.recipientId,
    before: ctx.recipientStatus ? { status: ctx.recipientStatus } : null,
    after: {
      status: "bounced",
      message_id: ctx.messageId,
      email_hash: ctx.emailHash,
      suppression_source: "hard_bounce",
    },
  })
}

/**
 * complaint: pending feedback_item (recipient/message may be null).
 * Nothing is auto-suppressed.
 */
export async function applyComplaintEffects(
  db: Database | DatabaseTransaction,
  ctx: SesMessageContext,
  event: ParsedSesEvent
): Promise<void> {
  await db
    .insert(feedbackItem)
    .values({
      recipientId: ctx.recipientId,
      messageId: ctx.messageId,
      source: "provider_fbl",
      provider: "ses",
      status: "pending",
      dedupeHash: feedbackDedupeHash(event.sesMessageId, event.eventType),
    })
    .onConflictDoNothing({
      target: feedbackItem.dedupeHash,
    })
}

async function updateMessageStatusInTx(
  db: Database | DatabaseTransaction,
  sesMessageId: string,
  status: SesMessageStatus
): Promise<void> {
  await db
    .update(message)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(message.sesMessageId, sesMessageId),
        inArray(message.status, [...PRIOR_STATUSES[status]] as Array<
          | "queued"
          | "sent"
          | "delivered"
          | "bounced"
          | "complained"
          | "skipped"
          | "failed"
        >)
      )
    )
}

/**
 * Stage C steps 4–6: forward-only message status, then hard-bounce or complaint.
 */
export async function applySesNotificationEvent(
  event: ParsedSesEvent,
  status: SesMessageStatus,
  db: Database = getDb()
): Promise<void> {
  await db.transaction(async (tx) => {
    await updateMessageStatusInTx(tx, event.sesMessageId, status)

    if (isHardBounceEvent(event)) {
      const ctx = await resolveHardBounceContext(tx, event)
      if (ctx) {
        await applyHardBounceEffects(tx, ctx)
      }
      return
    }

    if (isComplaintEvent(event)) {
      const ctx = await resolveComplaintContext(tx, event)
      await applyComplaintEffects(tx, ctx, event)
    }
  })
}
