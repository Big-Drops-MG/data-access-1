import {
  emailCategory,
  message,
  recipient,
  recipientPreference,
  suppressionEntry,
  template,
  templateVersion,
} from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { and, eq, inArray, isNull } from "drizzle-orm"

import { writeAudit } from "./audit.js"

type ApplyDb = Database | DatabaseTransaction

export type ApplyUnsubscribeScope = "category" | "all"

export type ApplyUnsubscribeInput = {
  messageId: string
  scope: ApplyUnsubscribeScope
  /** When set with scope `category`, prefer these category keys over the message category. */
  categoryKeys?: string[]
  requestId?: string | null
  ip?: string | null
  userAgent?: string | null
}

export type ApplyUnsubscribeResult =
  | { status: "applied"; recipientId: string; categoryIds: string[] }
  | { status: "not_found" }

/**
 * Persist a Hub thank-you / feedback unsubscribe: category preference(s)
 * (`unsubscribe_link`) and, for one-click / all, a `list_unsub` suppression row.
 */
export async function applyUnsubscribe(
  db: ApplyDb,
  input: ApplyUnsubscribeInput
): Promise<ApplyUnsubscribeResult> {
  const loaded = await loadMessageRecipient(db, input.messageId)
  if (!loaded) {
    return { status: "not_found" }
  }

  const categoryIds = await resolveCategoryIds(db, loaded.categoryId, input)
  if (categoryIds.length === 0) {
    return { status: "not_found" }
  }

  const now = new Date()
  for (const categoryId of categoryIds) {
    await upsertCategoryOptOut(db, {
      recipientId: loaded.recipientId,
      categoryId,
      now,
    })
  }

  if (input.scope === "all") {
    await ensureListUnsubSuppression(db, {
      emailHash: loaded.emailHash,
      recipientId: loaded.recipientId,
      now,
    })
  }

  await writeAudit(db, {
    actor: { type: "system" },
    action: "recipient.unsubscribe",
    objectType: "recipient",
    objectId: loaded.recipientId,
    requestId: input.requestId ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    after: {
      message_id: input.messageId,
      scope: input.scope,
      category_ids: categoryIds,
    },
  })

  return {
    status: "applied",
    recipientId: loaded.recipientId,
    categoryIds,
  }
}

async function loadMessageRecipient(
  db: ApplyDb,
  messageId: string
): Promise<{
  recipientId: string
  emailHash: string
  categoryId: string
} | null> {
  const rows = await db
    .select({
      recipientId: message.recipientId,
      emailHash: recipient.emailHash,
      categoryId: template.categoryId,
    })
    .from(message)
    .innerJoin(recipient, eq(recipient.id, message.recipientId))
    .innerJoin(
      templateVersion,
      eq(templateVersion.id, message.templateVersionId)
    )
    .innerJoin(template, eq(template.id, templateVersion.templateId))
    .where(eq(message.id, messageId))
    .limit(1)

  return rows[0] ?? null
}

async function resolveCategoryIds(
  db: ApplyDb,
  messageCategoryId: string,
  input: ApplyUnsubscribeInput
): Promise<string[]> {
  if (input.scope === "all") {
    const rows = await db
      .select({ id: emailCategory.id })
      .from(emailCategory)
      .where(
        and(
          eq(emailCategory.isActive, true),
          eq(emailCategory.kind, "relationship")
        )
      )
    return rows.map((row) => row.id)
  }

  const keys =
    input.categoryKeys?.map((key) => key.trim()).filter(Boolean) ?? []
  if (keys.length === 0) {
    return [messageCategoryId]
  }

  const rows = await db
    .select({ id: emailCategory.id })
    .from(emailCategory)
    .where(
      and(inArray(emailCategory.key, keys), eq(emailCategory.isActive, true))
    )
  return rows.map((row) => row.id)
}

async function upsertCategoryOptOut(
  db: ApplyDb,
  input: { recipientId: string; categoryId: string; now: Date }
): Promise<void> {
  await db
    .insert(recipientPreference)
    .values({
      recipientId: input.recipientId,
      categoryId: input.categoryId,
      optedOut: true,
      source: "unsubscribe_link",
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [recipientPreference.recipientId, recipientPreference.categoryId],
      set: {
        optedOut: true,
        source: "unsubscribe_link",
        updatedAt: input.now,
      },
    })
}

async function ensureListUnsubSuppression(
  db: ApplyDb,
  input: { emailHash: string; recipientId: string; now: Date }
): Promise<void> {
  const [existing] = await db
    .select({ id: suppressionEntry.id })
    .from(suppressionEntry)
    .where(
      and(
        eq(suppressionEntry.emailHash, input.emailHash),
        eq(suppressionEntry.scope, "list_unsub"),
        eq(suppressionEntry.source, "list_unsub"),
        isNull(suppressionEntry.offerId),
        isNull(suppressionEntry.removedAt)
      )
    )
    .limit(1)

  if (existing) {
    return
  }

  await db.insert(suppressionEntry).values({
    emailHash: input.emailHash,
    recipientId: input.recipientId,
    scope: "list_unsub",
    source: "list_unsub",
    reason: "hub_unsubscribe",
    createdAt: input.now,
  })
}

/** One-click (RFC 8058) body marker. */
export const LIST_UNSUBSCRIBE_ONE_CLICK_BODY = "List-Unsubscribe=One-Click"

export function parseUnsubscribeRequestBody(raw: string): {
  scope: ApplyUnsubscribeScope
  categoryKeys?: string[]
  oneClick: boolean
} {
  const trimmed = raw.trim()
  if (
    trimmed === "" ||
    trimmed === LIST_UNSUBSCRIBE_ONE_CLICK_BODY ||
    trimmed === `List-Unsubscribe=${encodeURIComponent("One-Click")}`
  ) {
    return { scope: "category", oneClick: trimmed !== "" }
  }

  if (
    trimmed.includes("List-Unsubscribe=One-Click") ||
    trimmed.includes("List-Unsubscribe=One%2DClick")
  ) {
    return { scope: "category", oneClick: true }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error("invalid_json")
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("invalid_body")
  }

  const record = parsed as Record<string, unknown>
  const keys = Object.keys(record)
  for (const key of keys) {
    if (key !== "categories" && key !== "scope") {
      throw new Error("unknown_field")
    }
  }

  if (record.scope === "all") {
    if (record.categories !== undefined) {
      throw new Error("invalid_body")
    }
    return { scope: "all", oneClick: false }
  }

  if (Array.isArray(record.categories)) {
    const categoryKeys = record.categories.filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim() !== ""
    )
    if (categoryKeys.length === 0) {
      throw new Error("invalid_body")
    }
    return { scope: "category", categoryKeys, oneClick: false }
  }

  if (keys.length === 0) {
    return { scope: "category", oneClick: false }
  }

  throw new Error("invalid_body")
}
