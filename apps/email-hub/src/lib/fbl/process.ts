import { eq } from "drizzle-orm"

import { feedbackItem, message, providerReport, recipient } from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import { hashEmail } from "@workspace/shared"

import {
  feedbackDedupeHashForReport,
  parseIntakeMail,
  type ParsedIntakeReport,
} from "@/lib/fbl/parse"

type Db = Database | DatabaseTransaction

type MatchResult = {
  messageId: string | null
  recipientId: string | null
}

export type ProcessFblMailResult = {
  kind: "ignored" | "processed"
  reportCreated: boolean
  feedbackCreated: boolean
  feedbackItemId: string | null
  matchedMessageId: string | null
  provider: string | null
}

async function matchReport(
  db: Db,
  parsed: ParsedIntakeReport
): Promise<MatchResult> {
  for (const sesId of parsed.sesMessageIds) {
    const [row] = await db
      .select({
        messageId: message.id,
        recipientId: message.recipientId,
      })
      .from(message)
      .where(eq(message.sesMessageId, sesId))
      .limit(1)
    if (row) {
      return { messageId: row.messageId, recipientId: row.recipientId }
    }
  }

  for (const originalId of parsed.originalMessageIds) {
    const [row] = await db
      .select({
        messageId: message.id,
        recipientId: message.recipientId,
      })
      .from(message)
      .where(eq(message.sesMessageId, originalId))
      .limit(1)
    if (row) {
      return { messageId: row.messageId, recipientId: row.recipientId }
    }
  }

  for (const email of parsed.recipientEmails) {
    const [row] = await db
      .select({
        recipientId: recipient.id,
      })
      .from(recipient)
      .where(eq(recipient.emailHash, hashEmail(email)))
      .limit(1)
    if (row) {
      return { messageId: null, recipientId: row.recipientId }
    }
  }

  return { messageId: null, recipientId: null }
}

async function insertMatchedFeedback(
  db: Db,
  parsed: ParsedIntakeReport,
  match: MatchResult
): Promise<string | null> {
  if (!match.messageId) {
    return null
  }
  const dedupeHash = feedbackDedupeHashForReport(
    parsed.contentHash,
    parsed.kind
  )
  const inserted = await db
    .insert(feedbackItem)
    .values({
      recipientId: match.recipientId,
      messageId: match.messageId,
      source: "mailbox_report",
      provider: parsed.provider,
      status: "pending",
      dedupeHash,
    })
    .onConflictDoNothing({ target: feedbackItem.dedupeHash })
    .returning({ id: feedbackItem.id })

  if (inserted[0]?.id) {
    return inserted[0].id
  }

  const [existing] = await db
    .select({ id: feedbackItem.id })
    .from(feedbackItem)
    .where(eq(feedbackItem.dedupeHash, dedupeHash))
    .limit(1)
  return existing?.id ?? null
}

async function insertProviderReport(
  db: Db,
  input: {
    parsed: ParsedIntakeReport
    raw: string
    feedbackItemId: string | null
    matchedMessageId: string | null
    matchedRecipientId: string | null
  }
): Promise<boolean> {
  const now = new Date()
  const inserted = await db
    .insert(providerReport)
    .values({
      provider: input.parsed.provider,
      mailboxUid: null,
      contentHash: input.parsed.contentHash,
      receivedAt: now,
      parsed: {
        kind: input.parsed.kind,
        report_message_id: input.parsed.reportMessageId,
        feedback_type: input.parsed.feedbackType,
        action: input.parsed.action,
        original_message_ids: input.parsed.originalMessageIds,
        ses_message_ids: input.parsed.sesMessageIds,
        recipient_emails: input.parsed.recipientEmails,
        matched_message_id: input.matchedMessageId,
        matched_recipient_id: input.matchedRecipientId,
        intake: "cloudflare_fbl",
      },
      rawContent: input.raw.slice(0, 64_000),
      status: "parsed",
      parsedAt: now,
      feedbackItemId: input.feedbackItemId,
    })
    .onConflictDoNothing({ target: providerReport.contentHash })
    .returning({ id: providerReport.id })

  return inserted.length > 0
}

/** Parse ARF/DSN raw MIME and persist provider_report + optional feedback_item. */
export async function processFblRawMail(
  raw: string,
  db: Database = getDb()
): Promise<ProcessFblMailResult> {
  const logger = getContextLogger()
  const parsed = await parseIntakeMail(raw)
  if (!parsed) {
    logger.info({ event: "fbl.webhook.ignored" }, "Non-report mail ignored")
    return {
      kind: "ignored",
      reportCreated: false,
      feedbackCreated: false,
      feedbackItemId: null,
      matchedMessageId: null,
      provider: null,
    }
  }

  const match = await matchReport(db, parsed)
  const feedbackItemId =
    match.messageId !== null
      ? await insertMatchedFeedback(db, parsed, match)
      : null
  const reportCreated = await insertProviderReport(db, {
    parsed,
    raw,
    feedbackItemId,
    matchedMessageId: match.messageId,
    matchedRecipientId: match.recipientId,
  })

  logger.info(
    {
      event: "fbl.webhook.processed",
      kind: parsed.kind,
      provider: parsed.provider,
      matched: match.messageId !== null,
      report_created: reportCreated,
      feedback_created: feedbackItemId !== null,
    },
    "Cloudflare FBL report processed"
  )

  return {
    kind: "processed",
    reportCreated,
    feedbackCreated: feedbackItemId !== null,
    feedbackItemId,
    matchedMessageId: match.messageId,
    provider: parsed.provider,
  }
}
