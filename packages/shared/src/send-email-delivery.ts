import type { Recipient } from "@workspace/db"
import {
  alert,
  message,
  recipient,
  sender,
  template,
  templateVersion,
} from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { and, eq, inArray, sql } from "drizzle-orm"

import { runSendChecks, type SendCheckSkipReason } from "./send-checks.js"
import type { TriggerEmailType } from "./trigger-email.js"

export const SES_ACCOUNT_PAUSED_ALERT_TYPE = "ses_account_paused"
export const SES_ACCOUNT_PAUSED_DEDUPE_KEY = "ses_account_paused"

const MISSING_ASSETS =
  "queued message is missing template, sender, or recipient"

type SendDb = Database | DatabaseTransaction

export type QueuedSendContext = {
  messageId: string
  recipient: Recipient
  emailType: TriggerEmailType
  offerId: string | null
  categoryId: string
  subject: string
  bodySource: string
  fromName: string
  fromEmail: string
  replyTo: string | null
}

export type LoadQueuedSendResult =
  | { state: "missing" }
  | { state: "not_queued" }
  | { state: "unsendable"; messageId: string; failureReason: string }
  | { state: "queued"; context: QueuedSendContext }

export async function loadQueuedSend(
  db: SendDb,
  messageId: string
): Promise<LoadQueuedSendResult> {
  const [row] = await db
    .select()
    .from(message)
    .where(eq(message.id, messageId))
    .limit(1)

  if (!row) {
    return { state: "missing" }
  }
  if (row.status !== "queued") {
    return { state: "not_queued" }
  }

  const templateVersionId = row.templateVersionId
  const senderId = row.senderId
  if (!templateVersionId || !senderId) {
    return {
      state: "unsendable",
      messageId: row.id,
      failureReason: MISSING_ASSETS,
    }
  }

  const recipientRows = await db
    .select()
    .from(recipient)
    .where(eq(recipient.id, row.recipientId))
    .limit(1)
  const versionRows = await db
    .select({
      subject: templateVersion.subject,
      bodySource: templateVersion.bodySource,
      categoryId: template.categoryId,
    })
    .from(templateVersion)
    .innerJoin(template, eq(template.id, templateVersion.templateId))
    .where(eq(templateVersion.id, templateVersionId))
    .limit(1)
  const senderRows = await db
    .select({
      fromName: sender.fromName,
      fromEmail: sender.fromEmail,
      replyTo: sender.replyTo,
    })
    .from(sender)
    .where(eq(sender.id, senderId))
    .limit(1)

  const recipientRow = recipientRows[0]
  const version = versionRows[0]
  const from = senderRows[0]
  if (!recipientRow || !version || !from) {
    return {
      state: "unsendable",
      messageId: row.id,
      failureReason: MISSING_ASSETS,
    }
  }

  const context: QueuedSendContext = {
    messageId: row.id,
    recipient: recipientRow,
    emailType: row.emailType,
    offerId: row.offerId,
    categoryId: version.categoryId,
    subject: version.subject,
    bodySource: version.bodySource,
    fromName: from.fromName,
    fromEmail: from.fromEmail,
    replyTo: from.replyTo,
  }

  return { state: "queued", context }
}

export async function skipQueuedMessageIfBlocked(
  db: SendDb,
  context: QueuedSendContext
): Promise<SendCheckSkipReason | null> {
  return db.transaction(async (tx) => {
    const reason = await runSendChecks(tx, {
      recipient: context.recipient,
      emailType: context.emailType,
      offerId: context.offerId,
      categoryId: context.categoryId,
    })
    if (!reason) {
      return null
    }
    await tx
      .update(message)
      .set({
        status: "skipped",
        skipReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(eq(message.id, context.messageId), eq(message.status, "queued"))
      )
    return reason
  })
}

const OPEN_SEND_STATUSES = ["queued", "sending"] as const

/**
 * Commits `queued` -> `sending` before the provider call. A crash after SES
 * accepts the message leaves this claim in place, so a retry does not send again.
 */
export async function claimQueuedMessage(
  db: Database,
  messageId: string
): Promise<boolean> {
  const claimed = await db
    .update(message)
    .set({
      status: "sending",
      updatedAt: new Date(),
    })
    .where(and(eq(message.id, messageId), eq(message.status, "queued")))
    .returning({ id: message.id })
  return claimed.length === 1
}

/** Puts a claimed row back to `queued` when the provider did not accept it. */
export async function releaseQueuedClaim(
  db: Database,
  messageId: string
): Promise<void> {
  await db
    .update(message)
    .set({
      status: "queued",
      updatedAt: new Date(),
    })
    .where(and(eq(message.id, messageId), eq(message.status, "sending")))
}

export async function markMessageSent(
  db: SendDb,
  messageId: string,
  sesMessageId: string,
  sentAt: Date
): Promise<void> {
  await db
    .update(message)
    .set({
      status: "sent",
      sesMessageId,
      sentAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(message.id, messageId),
        inArray(message.status, OPEN_SEND_STATUSES)
      )
    )
}

export async function markMessageFailed(
  db: SendDb,
  messageId: string,
  failureReason: string
): Promise<void> {
  await db
    .update(message)
    .set({
      status: "failed",
      failureReason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(message.id, messageId),
        inArray(message.status, OPEN_SEND_STATUSES)
      )
    )
}

/**
 * One database connection for the send. A second worker blocks until this
 * transaction commits, then sees the updated status. JavaScript failures are
 * rethrown after commit so a `failed` or `skipped` write is kept.
 */
export async function runSendEmailExclusive(
  db: Database,
  messageId: string,
  work: (tx: DatabaseTransaction) => Promise<void>
): Promise<void> {
  let failure: unknown
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${messageId}::text))`
    )
    try {
      await work(tx)
    } catch (error) {
      failure = error
    }
  })
  if (failure) {
    throw failure
  }
}

export async function openSesAccountPausedAlert(db: SendDb): Promise<void> {
  const now = new Date()
  const bumped = await db
    .update(alert)
    .set({
      lastTriggeredAt: now,
      occurrenceCount: sql`${alert.occurrenceCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(alert.dedupeKey, SES_ACCOUNT_PAUSED_DEDUPE_KEY),
        eq(alert.status, "open")
      )
    )
    .returning({ id: alert.id })

  if (bumped.length > 0) {
    return
  }

  try {
    await db.insert(alert).values({
      type: SES_ACCOUNT_PAUSED_ALERT_TYPE,
      severity: "critical",
      status: "open",
      dedupeKey: SES_ACCOUNT_PAUSED_DEDUPE_KEY,
      payload: { provider: "ses" },
    })
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    await db
      .update(alert)
      .set({
        lastTriggeredAt: new Date(),
        occurrenceCount: sql`${alert.occurrenceCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(alert.dedupeKey, SES_ACCOUNT_PAUSED_DEDUPE_KEY),
          eq(alert.status, "open")
        )
      )
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }
  if ("code" in error && error.code === "23505") {
    return true
  }
  if ("cause" in error) {
    return isUniqueViolation(error.cause)
  }
  return false
}
