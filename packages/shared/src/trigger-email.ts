import {
  alert,
  emailRoute,
  message,
  recipient,
  sender,
  template,
  templateVersion,
} from "@workspace/db"
import type {
  EmailRoute,
  Message,
  Recipient,
  Sender,
  TemplateVersion,
} from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import {
  getContextLogger,
  getRequestId,
  isValidRequestId,
  maskEmail,
} from "@workspace/logger"
import { and, eq, isNull, sql } from "drizzle-orm"

import {
  fillMissingComplianceMergeData,
  messageEnvironment,
  type MessageEnvironment,
} from "./compliance-tags.js"
import { hashEmail, normaliseEmail } from "./email.js"
import { AppError } from "./errors.js"
import { emailSchema } from "./schemas.js"
import { insertSkippedSendCheckMessage, runSendChecks } from "./send-checks.js"

export type EmailHubDb = Database
export type EmailHubTx = DatabaseTransaction

export type TriggerEmailType = "thank_you" | "feedback_request" | "engagement"

export type MergeData = Record<string, string | number | boolean>

export type TriggerEmailInput = {
  email: string
  idempotencyKey: string
  emailType: TriggerEmailType
  offerId?: string | null
  mergeData?: MergeData | null
  externalUserId?: string | null
  requestId?: string | null

  environment?: MessageEnvironment

  templateVersionId?: string | null
  sendId?: string | null
  senderId?: string | null
}

export type ResolvedRouteAssets = {
  route: EmailRoute
  templateVersion: TemplateVersion
  sender: Sender
  categoryId: string
}

export type TriggerEmailDeps = {
  enqueueSendEmail: (
    messageId: string,
    requestId?: string,
    environment?: MessageEnvironment
  ) => Promise<void>
}

export type TriggerEmailResult = {
  message: Message
  recipient: Recipient
  /** False when an existing row for `idempotencyKey` was returned. */
  created: boolean
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  )
}

export async function findOrCreateRecipient(
  db: EmailHubDb | EmailHubTx,
  email: string,
  externalUserId?: string | null
): Promise<Recipient> {
  const normalised = normaliseEmail(email)
  const parsed = emailSchema.safeParse(normalised)
  if (!parsed.success) {
    throw new AppError(
      "validation_failed",
      422,
      parsed.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "email",
        message: issue.message,
      }))
    )
  }

  const existing = await db
    .select()
    .from(recipient)
    .where(eq(recipient.email, normalised))
    .limit(1)

  if (existing[0]) {
    return existing[0]
  }

  const emailHash = hashEmail(normalised)
  try {
    const [created] = await db
      .insert(recipient)
      .values({
        email: normalised,
        emailHash,
        externalUserId: externalUserId ?? null,
      })
      .returning()
    if (!created) {
      throw new AppError("internal")
    }
    return created
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    const raced = await db
      .select()
      .from(recipient)
      .where(eq(recipient.email, normalised))
      .limit(1)
    if (!raced[0]) {
      throw new AppError("internal")
    }
    return raced[0]
  }
}

export async function lockRecipientTx(
  tx: EmailHubTx,
  recipientId: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${recipientId}::text))`
  )
}

export async function resolveEmailRoute(
  db: EmailHubDb | EmailHubTx,
  emailType: TriggerEmailType,
  offerId: string | null
): Promise<EmailRoute | null> {
  if (offerId) {
    const [specific] = await db
      .select()
      .from(emailRoute)
      .where(
        and(
          eq(emailRoute.emailType, emailType),
          eq(emailRoute.offerId, offerId),
          eq(emailRoute.status, "active")
        )
      )
      .limit(1)
    if (specific) {
      return specific
    }
  }

  const [fallback] = await db
    .select()
    .from(emailRoute)
    .where(
      and(
        eq(emailRoute.emailType, emailType),
        isNull(emailRoute.offerId),
        eq(emailRoute.status, "active")
      )
    )
    .limit(1)

  return fallback ?? null
}

export function requiredMergeTagNames(mergeTags: unknown): string[] {
  if (Array.isArray(mergeTags)) {
    return mergeTags.filter((tag): tag is string => typeof tag === "string")
  }
  if (mergeTags && typeof mergeTags === "object") {
    return Object.keys(mergeTags as Record<string, unknown>)
  }
  return []
}

export function assertMergeDataHasRequiredTags(
  mergeData: MergeData | null | undefined,
  mergeTags: unknown
): void {
  const data = mergeData ?? {}
  const details = requiredMergeTagNames(mergeTags)
    .filter((tag) => {
      const value = data[tag]
      if (value === undefined || value === null) {
        return true
      }
      return typeof value === "string" && value.trim() === ""
    })
    .map((tag) => ({
      path: `merge_data.${tag}`,
      message: "Required",
    }))
  if (details.length > 0) {
    throw AppError.validationFailed(details)
  }
}

export async function loadRouteSendAssets(
  db: EmailHubDb | EmailHubTx,
  route: EmailRoute
): Promise<ResolvedRouteAssets> {
  const [tpl] = await db
    .select()
    .from(template)
    .where(eq(template.id, route.templateId))
    .limit(1)
  if (!tpl?.currentVersionId) {
    throw new AppError("internal")
  }

  const [version] = await db
    .select()
    .from(templateVersion)
    .where(eq(templateVersion.id, tpl.currentVersionId))
    .limit(1)
  if (!version) {
    throw new AppError("internal")
  }

  const [from] = await db
    .select()
    .from(sender)
    .where(eq(sender.id, route.senderId))
    .limit(1)
  if (!from) {
    throw new AppError("internal")
  }

  return {
    route,
    templateVersion: version,
    sender: from,
    categoryId: tpl.categoryId,
  }
}

async function loadSenderById(
  db: EmailHubDb | EmailHubTx,
  senderId: string
): Promise<Sender> {
  const [from] = await db
    .select()
    .from(sender)
    .where(eq(sender.id, senderId))
    .limit(1)
  if (!from) {
    throw AppError.notFound([
      { path: "sender_id", message: "Sender not found" },
    ])
  }
  return from
}

async function loadRequestedTemplateVersion(
  db: EmailHubDb | EmailHubTx,
  versionId: string,
  emailType: TriggerEmailType
): Promise<{ templateVersion: TemplateVersion; categoryId: string }> {
  const [version] = await db
    .select()
    .from(templateVersion)
    .where(eq(templateVersion.id, versionId))
    .limit(1)
  if (!version) {
    throw AppError.notFound([
      { path: "version_id", message: "Version not found" },
    ])
  }

  const [tpl] = await db
    .select()
    .from(template)
    .where(eq(template.id, version.templateId))
    .limit(1)
  if (!tpl) {
    throw AppError.notFound([
      { path: "template_id", message: "Template not found" },
    ])
  }
  if (tpl.emailType !== emailType) {
    throw AppError.validationFailed([
      {
        path: "version_id",
        message: "Version does not match the template email type",
      },
    ])
  }

  return {
    templateVersion: version,
    categoryId: tpl.categoryId,
  }
}

export function noRouteAlertDedupeKey(
  emailType: TriggerEmailType,
  offerId: string | null
): string {
  return `no_route:${emailType}:${offerId ?? "null"}`
}

export async function openNoRouteAlert(
  tx: EmailHubTx,
  emailType: TriggerEmailType,
  offerId: string | null
): Promise<void> {
  const dedupeKey = noRouteAlertDedupeKey(emailType, offerId)
  try {
    await tx.insert(alert).values({
      type: "no_route",
      severity: "warning",
      status: "open",
      dedupeKey,
      payload: { email_type: emailType, offer_id: offerId },
    })
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    await tx
      .update(alert)
      .set({
        lastTriggeredAt: new Date(),
        occurrenceCount: sql`${alert.occurrenceCount} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(alert.dedupeKey, dedupeKey), eq(alert.status, "open")))
  }
}

async function insertNoRouteSkippedMessage(
  tx: EmailHubTx,
  input: {
    recipientId: string
    emailType: TriggerEmailType
    offerId: string | null
    idempotencyKey: string
    environment: MessageEnvironment
    sendId?: string | null
  }
): Promise<Message> {
  const [skipped] = await tx
    .insert(message)
    .values({
      recipientId: input.recipientId,
      offerId: input.offerId,
      emailType: input.emailType,
      templateVersionId: null,
      senderId: null,
      sendId: input.sendId ?? null,
      idempotencyKey: input.idempotencyKey,
      status: "skipped",
      skipReason: "no_route",
      environment: input.environment,
    })
    .returning()
  if (!skipped) {
    throw new AppError("internal")
  }
  return skipped
}

export async function insertQueuedMessage(
  tx: EmailHubTx,
  input: {
    recipientId: string
    offerId: string | null
    emailType: TriggerEmailType
    templateVersionId: string
    senderId: string
    idempotencyKey: string
    mergeData: MergeData
    environment: MessageEnvironment
    sendId?: string | null
  }
): Promise<Message> {
  const [created] = await tx
    .insert(message)
    .values({
      recipientId: input.recipientId,
      offerId: input.offerId,
      emailType: input.emailType,
      templateVersionId: input.templateVersionId,
      senderId: input.senderId,
      sendId: input.sendId ?? null,
      idempotencyKey: input.idempotencyKey,
      mergeData: input.mergeData,
      status: "queued",
      queuedAt: new Date(),
      environment: input.environment,
    })
    .returning()
  if (!created) {
    throw new AppError("internal")
  }
  return created
}

export async function triggerEmail(
  db: EmailHubDb,
  input: TriggerEmailInput,
  deps: TriggerEmailDeps
): Promise<TriggerEmailResult> {
  const idempotencyKey = input.idempotencyKey.trim()
  if (!idempotencyKey) {
    throw new AppError("validation_failed", 422, [
      { path: "idempotency_key", message: "Required" },
    ])
  }

  const emailType = input.emailType
  const offerId = input.offerId ?? null
  const mergeData = input.mergeData ?? {}
  const externalUserId = input.externalUserId ?? null
  const environment = messageEnvironment(input.environment)
  const requestedVersionId = input.templateVersionId ?? null
  const sendId = input.sendId ?? null
  const requestedSenderId = input.senderId ?? null
  const foundRecipient = await findOrCreateRecipient(
    db,
    input.email,
    externalUserId
  )

  const result = await db.transaction(async (tx) => {
    await lockRecipientTx(tx, foundRecipient.id)

    const [lockedRecipient] = await tx
      .select()
      .from(recipient)
      .where(eq(recipient.id, foundRecipient.id))
      .limit(1)
    const activeRecipient = lockedRecipient ?? foundRecipient

    const existing = await tx
      .select()
      .from(message)
      .where(eq(message.idempotencyKey, idempotencyKey))
      .limit(1)

    if (existing[0]) {
      return {
        message: existing[0],
        recipient: activeRecipient,
        created: false,
      }
    }

    const route = await resolveEmailRoute(tx, emailType, offerId)
    if (!route) {
      await openNoRouteAlert(tx, emailType, offerId)
      const skipped = await insertNoRouteSkippedMessage(tx, {
        recipientId: activeRecipient.id,
        emailType,
        offerId,
        idempotencyKey,
        environment,
        sendId,
      })
      return {
        message: skipped,
        recipient: activeRecipient,
        created: true,
      }
    }

    const assets = await loadRouteSendAssets(tx, route)
    const fromSender = requestedSenderId
      ? await loadSenderById(tx, requestedSenderId)
      : assets.sender
    const selected = requestedVersionId
      ? await loadRequestedTemplateVersion(tx, requestedVersionId, emailType)
      : {
          templateVersion: assets.templateVersion,
          categoryId: assets.categoryId,
        }
    const mergeDataForSend = fillMissingComplianceMergeData(
      mergeData,
      requiredMergeTagNames(selected.templateVersion.mergeTags),
      fromSender.postalAddress
    )
    assertMergeDataHasRequiredTags(
      mergeDataForSend,
      selected.templateVersion.mergeTags
    )

    const skipReason = await runSendChecks(tx, {
      recipient: activeRecipient,
      emailType,
      offerId,
      categoryId: selected.categoryId,
    })
    if (skipReason) {
      const skipped = await insertSkippedSendCheckMessage(tx, {
        recipientId: activeRecipient.id,
        emailType,
        offerId,
        idempotencyKey,
        templateVersionId: selected.templateVersion.id,
        senderId: fromSender.id,
        skipReason,
        environment,
        sendId,
      })
      return {
        message: skipped,
        recipient: activeRecipient,
        created: true,
      }
    }

    const created = await insertQueuedMessage(tx, {
      recipientId: activeRecipient.id,
      offerId,
      emailType,
      templateVersionId: selected.templateVersion.id,
      senderId: fromSender.id,
      idempotencyKey,
      mergeData: mergeDataForSend,
      environment,
      sendId,
    })

    return {
      message: created,
      recipient: activeRecipient,
      created: true,
    }
  })

  if (result.created && result.message.status === "queued") {
    const explicitRequestId = input.requestId?.trim()
    const requestId =
      explicitRequestId && isValidRequestId(explicitRequestId)
        ? explicitRequestId
        : getRequestId()
    const logger = requestId
      ? getContextLogger().child({ request_id: requestId })
      : getContextLogger()
    const recipient = maskEmail(input.email)
    try {
      if (environment === "test") {
        await deps.enqueueSendEmail(result.message.id, requestId, environment)
      } else if (requestId) {
        await deps.enqueueSendEmail(result.message.id, requestId)
      } else {
        await deps.enqueueSendEmail(result.message.id)
      }
      logger.info(
        {
          event: "message.queued",
          message_id: result.message.id,
          recipient,
          environment,
        },
        "Message queued"
      )
    } catch (error) {
      logger.error(
        {
          event: "message.queue_failed",
          message_id: result.message.id,
          recipient,
          environment,
          err: error,
        },
        "Message queue failed"
      )
    }
  }

  return result
}
