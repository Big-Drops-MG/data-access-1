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
import { and, eq, isNull, sql } from "drizzle-orm"

import { hashEmail, normaliseEmail } from "./email.js"
import { AppError } from "./errors.js"
import { emailSchema } from "./schemas.js"

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
}

export type ResolvedRouteAssets = {
  route: EmailRoute
  templateVersion: TemplateVersion
  sender: Sender
}

export type TriggerEmailCreateContext = {
  tx: EmailHubTx
  recipient: Recipient
  idempotencyKey: string
  email: string
  externalUserId: string | null
  emailType: TriggerEmailType
  offerId: string | null
  mergeData: MergeData
  route: EmailRoute
  templateVersion: TemplateVersion
  sender: Sender
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

/**
 * Find or create a recipient by normalised email (SD#7 Stage A step 2).
 * Concurrent inserts race on the unique email index and re-select.
 */
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

/** Per-recipient transaction lock (SD#7 Stage A step 3). */
export async function lockRecipientTx(
  tx: EmailHubTx,
  recipientId: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${recipientId}::text))`
  )
}

/**
 * Resolve active email_route: (email_type, offer_id) then (email_type, null).
 * SD#7 Stage A step 5 / route resolution.
 */
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

/** Required merge tag names from a template_version.merge_tags jsonb value. */
export function requiredMergeTagNames(mergeTags: unknown): string[] {
  if (Array.isArray(mergeTags)) {
    return mergeTags.filter((tag): tag is string => typeof tag === "string")
  }
  if (mergeTags && typeof mergeTags === "object") {
    return Object.keys(mergeTags as Record<string, unknown>)
  }
  return []
}

/**
 * Ensure merge_data includes every required tag (SD#7 step 6 / SD#10.1).
 * Throws 422 validation_failed with paths `merge_data.<tag>`.
 */
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

/** Load the route's template current version and sender. */
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

  return { route, templateVersion: version, sender: from }
}

export function noRouteAlertDedupeKey(
  emailType: TriggerEmailType,
  offerId: string | null
): string {
  return `no_route:${emailType}:${offerId ?? "null"}`
}

/** Open or bump a `no_route` alert (SD#15.4). */
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
      idempotencyKey: input.idempotencyKey,
      status: "skipped",
      skipReason: "no_route",
    })
    .returning()
  if (!skipped) {
    throw new AppError("internal")
  }
  return skipped
}

/**
 * Stage A steps 2–6 (SD#7): recipient, lock, idempotency, route resolve,
 * merge tag check. `createMessage` runs later Stage A steps (T-036+ / T-045).
 */
export async function triggerEmail(
  db: EmailHubDb,
  input: TriggerEmailInput,
  createMessage: (ctx: TriggerEmailCreateContext) => Promise<Message>
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
  const foundRecipient = await findOrCreateRecipient(
    db,
    input.email,
    externalUserId
  )
  const email = foundRecipient.email

  return db.transaction(async (tx) => {
    await lockRecipientTx(tx, foundRecipient.id)

    const existing = await tx
      .select()
      .from(message)
      .where(eq(message.idempotencyKey, idempotencyKey))
      .limit(1)

    if (existing[0]) {
      return {
        message: existing[0],
        recipient: foundRecipient,
        created: false,
      }
    }

    const route = await resolveEmailRoute(tx, emailType, offerId)
    if (!route) {
      await openNoRouteAlert(tx, emailType, offerId)
      const skipped = await insertNoRouteSkippedMessage(tx, {
        recipientId: foundRecipient.id,
        emailType,
        offerId,
        idempotencyKey,
      })
      return {
        message: skipped,
        recipient: foundRecipient,
        created: true,
      }
    }

    const assets = await loadRouteSendAssets(tx, route)
    assertMergeDataHasRequiredTags(mergeData, assets.templateVersion.mergeTags)

    const created = await createMessage({
      tx,
      recipient: foundRecipient,
      idempotencyKey,
      email,
      externalUserId,
      emailType,
      offerId,
      mergeData,
      route: assets.route,
      templateVersion: assets.templateVersion,
      sender: assets.sender,
    })

    return {
      message: created,
      recipient: foundRecipient,
      created: true,
    }
  })
}
