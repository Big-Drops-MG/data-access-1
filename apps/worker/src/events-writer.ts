import { randomUUID } from "node:crypto"

import { domain, message, recipient, sender } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { insertEmailEvents, type EmailEventRow } from "@workspace/db/clickhouse"
import { getContextLogger } from "@workspace/logger"
import {
  extractDomain,
  parseUserAgentEnvironment,
  type EventsJobData,
} from "@workspace/shared"
import { UnrecoverableError } from "bullmq"
import { eq, inArray } from "drizzle-orm"

export type EnrichedMessageContext = {
  messageId: string
  sendId: string | null
  recipientId: string
  offerId: string | null
  emailType: string
  templateVersionId: string | null
  senderId: string | null
  sendingDomain: string | null
  senderFromEmail: string | null
  recipientEmail: string | null
  /** Message classification from `message.environment`. */
  messageEnvironment?: "production" | "test"
}

export type EventsWorkerDependencies = {
  db: Database
  lookupMessageContext?: (
    sesMessageIds: string[]
  ) => Promise<Map<string, EnrichedMessageContext>>
  insertEvents?: (rows: EmailEventRow[]) => Promise<void>
  now?: () => number
}

function formatClickHouseDateTime64(dateOrIso: string | Date | number): string {
  const d = typeof dateOrIso === "object" ? dateOrIso : new Date(dateOrIso)
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().replace("T", " ").replace("Z", "")
  }
  return d.toISOString().replace("T", " ").replace("Z", "")
}

/**
 * Batch lookup of message context from PostgreSQL for multiple SES message IDs.
 * Prevents N+1 queries during event processing.
 */
export async function defaultLookupMessageContext(
  db: Database,
  sesMessageIds: string[]
): Promise<Map<string, EnrichedMessageContext>> {
  if (sesMessageIds.length === 0) {
    return new Map()
  }

  const rows = await db
    .select({
      sesMessageId: message.sesMessageId,
      messageId: message.id,
      sendId: message.sendId,
      recipientId: message.recipientId,
      offerId: message.offerId,
      emailType: message.emailType,
      templateVersionId: message.templateVersionId,
      senderId: message.senderId,
      sendingDomain: domain.name,
      senderFromEmail: sender.fromEmail,
      recipientEmail: recipient.email,
      messageEnvironment: message.environment,
    })
    .from(message)
    .leftJoin(recipient, eq(message.recipientId, recipient.id))
    .leftJoin(sender, eq(message.senderId, sender.id))
    .leftJoin(domain, eq(sender.domainId, domain.id))
    .where(inArray(message.sesMessageId, sesMessageIds))

  const map = new Map<string, EnrichedMessageContext>()
  for (const row of rows) {
    if (row.sesMessageId) {
      map.set(row.sesMessageId, {
        messageId: row.messageId,
        sendId: row.sendId,
        recipientId: row.recipientId,
        offerId: row.offerId,
        emailType: row.emailType,
        templateVersionId: row.templateVersionId,
        senderId: row.senderId,
        sendingDomain: row.sendingDomain,
        senderFromEmail: row.senderFromEmail,
        recipientEmail: row.recipientEmail,
        messageEnvironment: row.messageEnvironment,
      })
    }
  }

  return map
}

/**
 * Process an events-writer job:
 * 1. Validate payload.
 * 2. Enrich event metadata (domain, offer, template, environment).
 * 3. Insert into ClickHouse `email_events` with async_insert=1, wait_for_async_insert=1.
 * 4. Compute `lag_ms`.
 * 5. Log structured `events.inserted`.
 */
export async function processEventsJob(
  jobData: EventsJobData,
  deps: EventsWorkerDependencies
): Promise<void> {
  if (
    !jobData ||
    !jobData.sns_message_id ||
    !Array.isArray(jobData.records) ||
    jobData.records.length === 0
  ) {
    throw new UnrecoverableError(
      "Invalid events-writer job data: missing sns_message_id or records"
    )
  }

  const sesMessageIds = Array.from(
    new Set(jobData.records.map((r) => r.ses_message_id).filter(Boolean))
  )

  const lookupFn =
    deps.lookupMessageContext ??
    ((ids: string[]) => defaultLookupMessageContext(deps.db, ids))

  const messageContextMap = await lookupFn(sesMessageIds)

  // Verify that all records can be enriched with message context.
  // Missing messages trigger retry so out-of-order commits are handled cleanly.
  for (const record of jobData.records) {
    if (!messageContextMap.has(record.ses_message_id)) {
      throw new Error(
        `Message context not found for ses_message_id: ${record.ses_message_id}`
      )
    }
  }

  const rows: EmailEventRow[] = []

  for (const record of jobData.records) {
    const ctx = messageContextMap.get(record.ses_message_id)!
    const userAgentEnv = parseUserAgentEnvironment(record.user_agent)

    const sendingDomain =
      ctx.sendingDomain || extractDomain(ctx.senderFromEmail) || ""

    const recipientDomain =
      extractDomain(ctx.recipientEmail) ||
      extractDomain(record.recipient_emails?.[0]) ||
      ""

    const row: EmailEventRow = {
      event_id: record.event_id || randomUUID(),
      event_type: record.event_type,
      event_time: formatClickHouseDateTime64(record.event_time),
      message_id: ctx.messageId,
      ses_message_id: record.ses_message_id,
      recipient_id: ctx.recipientId,
      send_id: ctx.sendId,
      offer_id: ctx.offerId,
      email_type: ctx.emailType,
      template_version_id:
        ctx.templateVersionId ?? "00000000-0000-0000-0000-000000000000",
      sender_id: ctx.senderId ?? "00000000-0000-0000-0000-000000000000",
      sending_domain: sendingDomain,
      recipient_domain: recipientDomain,
      provider: "ses",
      bounce_type: record.bounce_type ?? "",
      bounce_subtype: record.bounce_subtype ?? "",
      smtp_status: record.smtp_status ?? "",
      smtp_diagnostic: record.smtp_diagnostic ?? "",
      delay_type: record.delay_type ?? "",
      complaint_type: record.complaint_type ?? "",
      link_url: record.link_url ?? "",
      user_agent: record.user_agent ?? "",
      client: userAgentEnv.client,
      device_type: userAgentEnv.device_type,
      os: userAgentEnv.os,
      country: userAgentEnv.country,
      region: userAgentEnv.region,
      is_machine: userAgentEnv.is_machine,
      machine_reason: userAgentEnv.machine_reason,
      raw_payload: record.raw_payload ?? "{}",
    }

    rows.push(row)
  }

  const insertFn = deps.insertEvents ?? ((r) => insertEmailEvents(r))
  await insertFn(rows)

  const insertAcknowledgedAt = (deps.now ?? Date.now)()
  const primaryRecord = jobData.records[0]
  const eventOccurredAt = primaryRecord?.event_time
    ? Date.parse(primaryRecord.event_time) || insertAcknowledgedAt
    : insertAcknowledgedAt

  const lagMs = Math.max(0, insertAcknowledgedAt - eventOccurredAt)

  const messageEnvironment = jobData.records
    .map(
      (record) =>
        messageContextMap.get(record.ses_message_id)?.messageEnvironment
    )
    .find((value) => value === "test" || value === "production")

  getContextLogger().info(
    {
      event: "events.inserted",
      sns_message_id: jobData.sns_message_id,
      job_id: jobData.sns_message_id,
      message_id: rows[0]?.message_id,
      ...(jobData.workspace_id ? { workspace_id: jobData.workspace_id } : {}),
      ...(messageEnvironment ? { environment: messageEnvironment } : {}),
      inserted_count: rows.length,
      lag_ms: lagMs,
    },
    "Events inserted"
  )
}
