import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  inArray,
  lt,
  type SQL,
} from "drizzle-orm"

import {
  emailCategory,
  message,
  offer,
  recipient,
  recipientPreference,
  template,
  templateVersion,
  type Message,
  type Recipient,
} from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import { AppError, normaliseEmail } from "@workspace/shared"

import { recipientScopedToOffer } from "@/lib/offer-scope"

import {
  serializeRecipientListItem,
  serializeRecipientMessage,
  serializeRecipientOffer,
  serializeRecipientPreference,
  type RecipientDetailJson,
  type RecipientListItemJson,
  type RecipientOfferJson,
} from "./serialize"

export type RecipientStatusCounts = {
  all: number
  active: number
  bounced: number
  unsubscribed: number
}

export type ListRecipientsInput = {
  limit: number
  cursor?: string
  email?: string
  status?: Recipient["status"]
  unsubscribed?: boolean
  optedOutCategoryId?: string
  offerId?: string
}

export async function listRecipients(
  input: ListRecipientsInput,
  db: Database = getDb()
): Promise<{
  data: RecipientListItemJson[]
  next_cursor: string | null
  status_counts: RecipientStatusCounts
}> {
  const conditions: SQL[] = []

  if (input.email) {
    conditions.push(eq(recipient.email, normaliseEmail(input.email)))
  }
  if (input.status) {
    conditions.push(eq(recipient.status, input.status))
  }
  if (input.offerId) {
    conditions.push(recipientScopedToOffer(db, input.offerId))
  }
  if (input.unsubscribed) {
    conditions.push(recipientHasOptOut(db))
  }
  if (input.optedOutCategoryId) {
    const [category] = await db
      .select({ id: emailCategory.id })
      .from(emailCategory)
      .where(eq(emailCategory.id, input.optedOutCategoryId))
      .limit(1)
    if (!category) {
      throw AppError.validationFailed([
        {
          path: "opted_out_category_id",
          message: "Category not found",
        },
      ])
    }
    conditions.push(
      eq(recipientPreference.categoryId, input.optedOutCategoryId)
    )
    conditions.push(eq(recipientPreference.optedOut, true))
  }
  if (input.cursor) {
    conditions.push(lt(recipient.id, input.cursor))
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const needsPreferenceJoin = Boolean(input.optedOutCategoryId)

  const [rows, statusCounts] = await Promise.all([
    needsPreferenceJoin
      ? db
          .select({ recipient })
          .from(recipient)
          .innerJoin(
            recipientPreference,
            eq(recipientPreference.recipientId, recipient.id)
          )
          .where(where)
          .orderBy(desc(recipient.id))
          .limit(input.limit + 1)
      : db
          .select({ recipient })
          .from(recipient)
          .where(where)
          .orderBy(desc(recipient.id))
          .limit(input.limit + 1),
    countRecipientsByStatus(db, {
      email: input.email,
      offerId: input.offerId,
    }),
  ])

  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  const next = rows.length > input.limit ? (last?.recipient.id ?? null) : null
  const recipientIds = page.map((row) => row.recipient.id)
  const lastMessages = await loadLastMessagesByRecipientIds(db, recipientIds)
  const offerIds = [
    ...new Set(
      [...lastMessages.values()]
        .map((row) => row.offerId)
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const [unsubscribedIds, offersById] = await Promise.all([
    loadUnsubscribedRecipientIds(db, recipientIds),
    loadOffersByIds(db, offerIds),
  ])

  return {
    data: page.map((row) => {
      const lastMessage = lastMessages.get(row.recipient.id) ?? null
      return serializeRecipientListItem(row.recipient, lastMessage, {
        unsubscribed: unsubscribedIds.has(row.recipient.id),
        offer: lastMessage?.offerId
          ? (offersById.get(lastMessage.offerId) ?? null)
          : null,
      })
    }),
    next_cursor: next,
    status_counts: statusCounts,
  }
}

function recipientHasOptOut(db: Database): SQL {
  return exists(
    db
      .select({ id: recipientPreference.id })
      .from(recipientPreference)
      .where(
        and(
          eq(recipientPreference.recipientId, recipient.id),
          eq(recipientPreference.optedOut, true)
        )
      )
  )
}

async function countRecipientsByStatus(
  db: Database,
  input: { email?: string; offerId?: string }
): Promise<RecipientStatusCounts> {
  const conditions: SQL[] = []
  if (input.email) {
    conditions.push(eq(recipient.email, normaliseEmail(input.email)))
  }
  if (input.offerId) {
    conditions.push(recipientScopedToOffer(db, input.offerId))
  }
  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const unsubscribedWhere =
    where == null ? recipientHasOptOut(db) : and(where, recipientHasOptOut(db))

  const [statusRows, unsubscribedRows] = await Promise.all([
    db
      .select({ status: recipient.status, total: count() })
      .from(recipient)
      .where(where)
      .groupBy(recipient.status),
    db
      .select({ total: countDistinct(recipient.id) })
      .from(recipient)
      .where(unsubscribedWhere),
  ])

  const counts: RecipientStatusCounts = {
    all: 0,
    active: 0,
    bounced: 0,
    unsubscribed: Number(unsubscribedRows[0]?.total ?? 0),
  }

  for (const row of statusRows) {
    counts[row.status] = Number(row.total) || 0
    counts.all += Number(row.total) || 0
  }

  return counts
}

async function loadUnsubscribedRecipientIds(
  db: Database,
  recipientIds: string[]
): Promise<Set<string>> {
  const ids = new Set<string>()
  if (recipientIds.length === 0) {
    return ids
  }

  const rows = await db
    .select({ recipientId: recipientPreference.recipientId })
    .from(recipientPreference)
    .where(
      and(
        inArray(recipientPreference.recipientId, recipientIds),
        eq(recipientPreference.optedOut, true)
      )
    )

  for (const row of rows) {
    ids.add(row.recipientId)
  }
  return ids
}

async function loadOffersByIds(
  db: Database,
  offerIds: string[]
): Promise<Map<string, RecipientOfferJson>> {
  const map = new Map<string, RecipientOfferJson>()
  if (offerIds.length === 0) {
    return map
  }

  const rows = await db
    .select({
      id: offer.id,
      externalRef: offer.externalRef,
      name: offer.name,
    })
    .from(offer)
    .where(inArray(offer.id, offerIds))

  for (const row of rows) {
    map.set(row.id, serializeRecipientOffer(row))
  }
  return map
}

async function loadLastMessagesByRecipientIds(
  db: Database,
  recipientIds: string[]
): Promise<Map<string, Message>> {
  const map = new Map<string, Message>()
  if (recipientIds.length === 0) {
    return map
  }

  const rows = await db
    .select()
    .from(message)
    .where(inArray(message.recipientId, recipientIds))
    .orderBy(desc(message.createdAt), desc(message.id))

  for (const row of rows) {
    if (!map.has(row.recipientId)) {
      map.set(row.recipientId, row)
    }
  }

  return map
}

export async function getRecipientDetail(
  id: string,
  db: Database = getDb()
): Promise<RecipientDetailJson> {
  const [row] = await db
    .select()
    .from(recipient)
    .where(eq(recipient.id, id))
    .limit(1)

  if (!row) {
    throw AppError.notFound([{ path: "id", message: "Recipient not found" }])
  }

  const [categories, preferences, messages] = await Promise.all([
    db
      .select()
      .from(emailCategory)
      .where(eq(emailCategory.isActive, true))
      .orderBy(asc(emailCategory.key)),
    db
      .select()
      .from(recipientPreference)
      .where(eq(recipientPreference.recipientId, id)),
    db
      .select({
        message,
        templateName: template.name,
      })
      .from(message)
      .leftJoin(
        templateVersion,
        eq(message.templateVersionId, templateVersion.id)
      )
      .leftJoin(template, eq(templateVersion.templateId, template.id))
      .where(eq(message.recipientId, id))
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(50),
  ])

  const preferenceByCategory = new Map(
    preferences.map((preference) => [preference.categoryId, preference])
  )
  const lastMessage = messages[0]?.message ?? null
  const offerRow = lastMessage?.offerId
    ? ((await loadOffersByIds(db, [lastMessage.offerId])).get(
        lastMessage.offerId
      ) ?? null)
    : null

  return {
    ...serializeRecipientListItem(row, lastMessage, {
      unsubscribed: preferences.some((preference) => preference.optedOut),
      offer: offerRow,
    }),
    preferences: categories.map((category) =>
      serializeRecipientPreference({
        category,
        preference: preferenceByCategory.get(category.id) ?? null,
      })
    ),
    messages: messages.map((row) =>
      serializeRecipientMessage(row.message, row.templateName)
    ),
  }
}
