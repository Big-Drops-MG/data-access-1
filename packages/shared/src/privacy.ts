import { and, eq, isNull, sql } from "drizzle-orm"

import {
  feedbackItem,
  message,
  recipient,
  recipientPreference,
  suppressionEntry,
  type FeedbackItem,
  type Message,
  type Recipient,
  type RecipientPreference,
  type SuppressionEntry,
} from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"

import { writeAudit } from "./audit.js"
import { hashEmail, normaliseEmail } from "./email.js"
import { AppError } from "./errors.js"

type Db = Database | DatabaseTransaction

const SUPPRESSION_KEEP_PRIORITY: readonly SuppressionEntry["source"][] = [
  "hard_bounce",
  "feedback_review",
  "list_unsub",
  "manual",
  "optizmo",
]

export const PRIVACY_ERASURE_REASON = "privacy_erasure"

export type PrivacyExportMessage = {
  id: string
  send_id: string | null
  offer_id: string | null
  email_type: Message["emailType"]
  status: Message["status"]
  skip_reason: Message["skipReason"]
  failure_reason: string | null
  ses_message_id: string | null
  environment: Message["environment"]
  queued_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export type PrivacyExport = {
  email_hash: string
  recipient: {
    id: string
    email: string
    email_hash: string
    first_name: string | null
    last_name: string | null
    external_user_id: string | null
    tier: Recipient["tier"]
    status: Recipient["status"]
    created_at: string
    updated_at: string
    last_emailed_at: string | null
  }
  preferences: Array<{
    id: string
    category_id: string
    opted_out: boolean
    source: RecipientPreference["source"]
    created_at: string
    updated_at: string
  }>
  messages: PrivacyExportMessage[]
  feedback_items: Array<{
    id: string
    message_id: string | null
    source: FeedbackItem["source"]
    provider: string | null
    status: FeedbackItem["status"]
    decision: FeedbackItem["decision"]
    created_at: string
    updated_at: string
  }>
  suppressions: Array<{
    id: string
    scope: SuppressionEntry["scope"]
    offer_id: string | null
    source: SuppressionEntry["source"]
    reason: string | null
    created_at: string
    removed_at: string | null
  }>
}

export type PrivacyEraseResult = {
  recipient_id: string
  email_hash: string
  erased_email: string
  suppression_id: string
  suppressions_removed: number
  messages_scrubbed: number
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

export function privacyErasedEmail(emailHash: string): string {
  return emailHash
}

export function pickSuppressionToKeep(
  rows: SuppressionEntry[]
): SuppressionEntry | null {
  const active = rows.filter((row) => row.removedAt == null)
  if (active.length === 0) {
    return null
  }
  for (const source of SUPPRESSION_KEEP_PRIORITY) {
    const match = active.find((row) => row.source === source)
    if (match) {
      return match
    }
  }
  return active[0] ?? null
}

function scrubMergeData(
  data: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(data)) {
    const canonical = key.toLowerCase().replaceAll("_", "").replaceAll("-", "")
    if (
      canonical.includes("email") ||
      canonical.includes("firstname") ||
      canonical.includes("lastname") ||
      canonical.includes("name") ||
      canonical.includes("phone")
    ) {
      continue
    }
    if (typeof value === "string" && value.includes("@")) {
      continue
    }
    out[key] = value
  }
  return out
}

async function findRecipientForPrivacy(
  db: Db,
  rawEmail: string
): Promise<Recipient | undefined> {
  const normalised = normaliseEmail(rawEmail)
  const emailHash = hashEmail(normalised)

  const [byEmail] = await db
    .select()
    .from(recipient)
    .where(eq(recipient.email, normalised))
    .limit(1)
  if (byEmail) {
    return byEmail
  }

  const [byHash] = await db
    .select()
    .from(recipient)
    .where(eq(recipient.emailHash, emailHash))
    .limit(1)
  if (byHash) {
    return byHash
  }

  const [byErased] = await db
    .select()
    .from(recipient)
    .where(eq(recipient.email, emailHash))
    .limit(1)
  return byErased
}

export async function exportPrivacyData(
  db: Db,
  rawEmail: string
): Promise<PrivacyExport> {
  const row = await findRecipientForPrivacy(db, rawEmail)
  if (!row) {
    throw AppError.notFound([{ path: "email", message: "Recipient not found" }])
  }

  const [preferences, messages, feedbackItems, suppressions] =
    await Promise.all([
      db
        .select()
        .from(recipientPreference)
        .where(eq(recipientPreference.recipientId, row.id)),
      db.select().from(message).where(eq(message.recipientId, row.id)),
      db
        .select()
        .from(feedbackItem)
        .where(eq(feedbackItem.recipientId, row.id)),
      db
        .select()
        .from(suppressionEntry)
        .where(eq(suppressionEntry.emailHash, row.emailHash)),
    ])

  const exportPayload: PrivacyExport = {
    email_hash: row.emailHash,
    recipient: {
      id: row.id,
      email: row.email,
      email_hash: row.emailHash,
      first_name: row.firstName,
      last_name: row.lastName,
      external_user_id: row.externalUserId,
      tier: row.tier,
      status: row.status,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      last_emailed_at: iso(row.lastEmailedAt),
    },
    preferences: preferences.map((pref) => ({
      id: pref.id,
      category_id: pref.categoryId,
      opted_out: pref.optedOut,
      source: pref.source,
      created_at: pref.createdAt.toISOString(),
      updated_at: pref.updatedAt.toISOString(),
    })),
    messages: messages.map((msg) => ({
      id: msg.id,
      send_id: msg.sendId,
      offer_id: msg.offerId,
      email_type: msg.emailType,
      status: msg.status,
      skip_reason: msg.skipReason,
      failure_reason: msg.failureReason,
      ses_message_id: msg.sesMessageId,
      environment: msg.environment,
      queued_at: iso(msg.queuedAt),
      sent_at: iso(msg.sentAt),
      created_at: msg.createdAt.toISOString(),
      updated_at: msg.updatedAt.toISOString(),
    })),
    feedback_items: feedbackItems.map((item) => ({
      id: item.id,
      message_id: item.messageId,
      source: item.source,
      provider: item.provider,
      status: item.status,
      decision: item.decision,
      created_at: item.createdAt.toISOString(),
      updated_at: item.updatedAt.toISOString(),
    })),
    suppressions: suppressions.map((entry) => ({
      id: entry.id,
      scope: entry.scope,
      offer_id: entry.offerId,
      source: entry.source,
      reason: entry.reason,
      created_at: entry.createdAt.toISOString(),
      removed_at: iso(entry.removedAt),
    })),
  }

  await writeAudit(db, {
    actor: { type: "system" },
    action: "recipient.privacy.export",
    objectType: "recipient",
    objectId: row.id,
    before: null,
    after: {
      email_hash: row.emailHash,
      preferences: preferences.length,
      messages: messages.length,
      feedback_items: feedbackItems.length,
      suppressions: suppressions.length,
    },
  })

  return exportPayload
}

async function ensureKeptSuppression(
  db: Db,
  row: Recipient,
  now: Date
): Promise<{ kept: SuppressionEntry; removed: number }> {
  const existing = await db
    .select()
    .from(suppressionEntry)
    .where(eq(suppressionEntry.emailHash, row.emailHash))

  const keep = pickSuppressionToKeep(existing)
  let kept = keep
  let removed = 0

  if (!kept) {
    const [inserted] = await db
      .insert(suppressionEntry)
      .values({
        emailHash: row.emailHash,
        recipientId: row.id,
        scope: "global",
        source: "manual",
        reason: PRIVACY_ERASURE_REASON,
      })
      .onConflictDoNothing({
        target: [suppressionEntry.emailHash, suppressionEntry.scope],
        where: sql`${suppressionEntry.removedAt} IS NULL AND ${suppressionEntry.offerId} IS NULL`,
      })
      .returning()

    if (inserted) {
      kept = inserted
    } else {
      const [active] = await db
        .select()
        .from(suppressionEntry)
        .where(
          and(
            eq(suppressionEntry.emailHash, row.emailHash),
            isNull(suppressionEntry.removedAt)
          )
        )
        .limit(1)
      if (!active) {
        throw AppError.conflict([
          {
            path: "suppression",
            message: "Could not keep a suppression entry after erasure",
          },
        ])
      }
      kept = active
    }
  }

  for (const entry of existing) {
    if (entry.removedAt != null || entry.id === kept.id) {
      continue
    }
    await db
      .update(suppressionEntry)
      .set({ removedAt: now })
      .where(eq(suppressionEntry.id, entry.id))
    removed += 1
  }

  if (kept.recipientId !== row.id) {
    await db
      .update(suppressionEntry)
      .set({ recipientId: row.id })
      .where(eq(suppressionEntry.id, kept.id))
    kept = { ...kept, recipientId: row.id }
  }

  return { kept, removed }
}

export async function erasePrivacyData(
  db: Db,
  rawEmail: string
): Promise<PrivacyEraseResult> {
  const row = await findRecipientForPrivacy(db, rawEmail)
  if (!row) {
    throw AppError.notFound([{ path: "email", message: "Recipient not found" }])
  }

  const now = new Date()
  const erasedEmail = privacyErasedEmail(row.emailHash)

  return db.transaction(async (tx) => {
    const before = {
      email_hash: row.emailHash,
      status: row.status,
      had_name: Boolean(row.firstName || row.lastName),
      had_external_user_id: Boolean(row.externalUserId),
    }

    const [updated] = await tx
      .update(recipient)
      .set({
        email: erasedEmail,
        firstName: null,
        lastName: null,
        externalUserId: null,
        status: "bounced",
        updatedAt: now,
      })
      .where(eq(recipient.id, row.id))
      .returning()

    if (!updated) {
      throw AppError.conflict([
        { path: "recipient", message: "Recipient update failed" },
      ])
    }

    const messages = await tx
      .select()
      .from(message)
      .where(eq(message.recipientId, row.id))

    let messagesScrubbed = 0
    for (const msg of messages) {
      const scrubbed = scrubMergeData(msg.mergeData ?? {})
      const changed =
        JSON.stringify(scrubbed) !== JSON.stringify(msg.mergeData ?? {})
      if (!changed) {
        continue
      }
      await tx
        .update(message)
        .set({ mergeData: scrubbed, updatedAt: now })
        .where(eq(message.id, msg.id))
      messagesScrubbed += 1
    }

    const { kept, removed } = await ensureKeptSuppression(tx, updated, now)

    const result: PrivacyEraseResult = {
      recipient_id: updated.id,
      email_hash: updated.emailHash,
      erased_email: updated.email,
      suppression_id: kept.id,
      suppressions_removed: removed,
      messages_scrubbed: messagesScrubbed,
    }

    await writeAudit(tx, {
      actor: { type: "system" },
      action: "recipient.privacy.erase",
      objectType: "recipient",
      objectId: updated.id,
      before,
      after: {
        email_hash: result.email_hash,
        status: updated.status,
        suppression_id: result.suppression_id,
        suppressions_removed: result.suppressions_removed,
        messages_scrubbed: result.messages_scrubbed,
      },
    })

    return result
  })
}
