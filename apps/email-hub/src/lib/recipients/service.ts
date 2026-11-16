import { and, asc, desc, eq, lt, type SQL } from "drizzle-orm"

import {
  emailCategory,
  message,
  recipient,
  recipientPreference,
  type Recipient,
} from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import { AppError, normaliseEmail } from "@workspace/shared"

import {
  serializeRecipientListItem,
  serializeRecipientMessage,
  serializeRecipientPreference,
  type RecipientDetailJson,
  type RecipientListItemJson,
} from "./serialize"

export type ListRecipientsInput = {
  limit: number
  cursor?: string
  email?: string
  status?: Recipient["status"]
  optedOutCategoryId?: string
}

export async function listRecipients(
  input: ListRecipientsInput,
  db: Database = getDb()
): Promise<{ data: RecipientListItemJson[]; next_cursor: string | null }> {
  const conditions: SQL[] = []

  if (input.email) {
    conditions.push(eq(recipient.email, normaliseEmail(input.email)))
  }
  if (input.status) {
    conditions.push(eq(recipient.status, input.status))
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

  const query = input.optedOutCategoryId
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
        .limit(input.limit + 1)

  const rows = await query
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  const next = rows.length > input.limit ? (last?.recipient.id ?? null) : null

  return {
    data: page.map((row) => serializeRecipientListItem(row.recipient)),
    next_cursor: next,
  }
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
      .select()
      .from(message)
      .where(eq(message.recipientId, id))
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(50),
  ])

  const preferenceByCategory = new Map(
    preferences.map((preference) => [preference.categoryId, preference])
  )

  return {
    ...serializeRecipientListItem(row),
    preferences: categories.map((category) =>
      serializeRecipientPreference({
        category,
        preference: preferenceByCategory.get(category.id) ?? null,
      })
    ),
    messages: messages.map(serializeRecipientMessage),
  }
}
