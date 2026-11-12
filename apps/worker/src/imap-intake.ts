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
} from "./imap-intake-parse.js"
import {
  createImapFlowMailbox,
  type ImapMailbox,
  type ImapMailboxConfig,
} from "./imap-mailbox.js"

export const IMAP_INTAKE_BATCH_SIZE = 100

type Db = Database | DatabaseTransaction

export type ImapIntakeEnv = {
  IMAP_HOST?: string
  IMAP_USER?: string
  IMAP_PASSWORD?: string
}

export type ProcessImapIntakeDeps = {
  db?: Database
  mailbox?: ImapMailbox
  env?: ImapIntakeEnv
  batchSize?: number
}

type MatchResult = {
  messageId: string | null
  recipientId: string | null
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

function resolveMailbox(deps: ProcessImapIntakeDeps): ImapMailbox | null {
  if (deps.mailbox) {
    return deps.mailbox
  }
  const env = deps.env
  if (!env?.IMAP_HOST || !env.IMAP_USER || !env.IMAP_PASSWORD) {
    return null
  }
  const config: ImapMailboxConfig = {
    host: env.IMAP_HOST,
    user: env.IMAP_USER,
    password: env.IMAP_PASSWORD,
    port: 993,
    secure: true,
  }
  return createImapFlowMailbox(config)
}

export async function processImapIntakeJob(
  deps: ProcessImapIntakeDeps = {}
): Promise<{
  fetched: number
  processed: number
  skipped: number
  reports: number
  feedbackItems: number
}> {
  const logger = getContextLogger()
  const mailbox = resolveMailbox(deps)
  if (!mailbox) {
    logger.info(
      { event: "imap_intake.skipped_unconfigured" },
      "IMAP intake skipped; credentials not configured"
    )
    return {
      fetched: 0,
      processed: 0,
      skipped: 0,
      reports: 0,
      feedbackItems: 0,
    }
  }

  const db = deps.db ?? getDb()
  const batchSize = deps.batchSize ?? IMAP_INTAKE_BATCH_SIZE
  let processed = 0
  let skipped = 0
  let reports = 0
  let feedbackItems = 0

  await mailbox.connect()
  try {
    const messages = await mailbox.fetchUnseen(batchSize)
    const fetched = messages.length

    for (const msg of messages) {
      const parsed = await parseIntakeMail(msg.raw)
      if (!parsed) {
        skipped += 1
        logger.info(
          { event: "imap_intake.unrelated", mailbox_uid: msg.uid },
          "Leaving unrelated mail in place"
        )
        continue
      }

      const match = await matchReport(db, parsed)
      const createdFeedback =
        match.messageId !== null
          ? await insertMatchedFeedback(db, parsed, match)
          : null

      const inserted = await insertProviderReport(db, {
        parsed,
        mailboxUid: String(msg.uid),
        raw: msg.raw.toString("utf8"),
        feedbackItemId: createdFeedback,
        matchedMessageId: match.messageId,
        matchedRecipientId: match.recipientId,
      })

      if (inserted) {
        reports += 1
      }
      if (createdFeedback) {
        feedbackItems += 1
      }

      await mailbox.moveToProcessed(msg.uid)
      processed += 1
      logger.info(
        {
          event: "imap_intake.processed",
          mailbox_uid: msg.uid,
          kind: parsed.kind,
          provider: parsed.provider,
          matched: match.messageId !== null,
          report_created: inserted,
          feedback_created: createdFeedback !== null,
        },
        "IMAP report processed"
      )
    }

    logger.info(
      {
        event: "imap_intake.completed",
        fetched,
        processed,
        skipped,
        reports,
        feedback_items: feedbackItems,
      },
      "IMAP intake run finished"
    )

    return { fetched, processed, skipped, reports, feedbackItems }
  } finally {
    await mailbox.close()
  }
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
    mailboxUid: string
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
      mailboxUid: input.mailboxUid,
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
