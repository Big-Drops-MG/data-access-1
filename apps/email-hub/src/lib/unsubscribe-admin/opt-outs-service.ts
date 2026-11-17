import { and, desc, eq, isNull, lt, sql, type SQL } from "drizzle-orm"

import {
  emailCategory,
  recipient,
  recipientPreference,
  suppressionEntry,
} from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import { AppError } from "@workspace/shared"

import type { UnsubscribeOptOutJson } from "./serialize"

export type ListOptOutsInput = {
  limit: number
  cursor?: string
  q?: string
  scope: "category" | "all" | "all_types"
}

type CursorPayload = {
  kind: "category" | "all"
  id: string
  t: string
}

function encodeCursor(row: UnsubscribeOptOutJson): string {
  const payload: CursorPayload = {
    kind: row.kind,
    id: row.id,
    t: row.occurred_at,
  }
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodeCursor(raw: string): CursorPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as CursorPayload
    if (
      (parsed.kind !== "category" && parsed.kind !== "all") ||
      typeof parsed.id !== "string" ||
      typeof parsed.t !== "string" ||
      Number.isNaN(Date.parse(parsed.t))
    ) {
      throw new Error("invalid")
    }
    return parsed
  } catch {
    throw AppError.validationFailed([
      { path: "cursor", message: "Invalid cursor" },
    ])
  }
}

function afterCursor(
  row: UnsubscribeOptOutJson,
  cursor: CursorPayload
): boolean {
  const rowTime = Date.parse(row.occurred_at)
  const cursorTime = Date.parse(cursor.t)
  if (rowTime < cursorTime) {
    return true
  }
  if (rowTime > cursorTime) {
    return false
  }
  if (row.id < cursor.id) {
    return true
  }
  if (row.id > cursor.id) {
    return false
  }
  return row.kind < cursor.kind
}

export async function listUnsubscribeOptOuts(
  input: ListOptOutsInput,
  db: Database = getDb()
): Promise<{ data: UnsubscribeOptOutJson[]; next_cursor: string | null }> {
  const cursor = input.cursor ? decodeCursor(input.cursor) : null
  const fetchLimit = input.limit + 1

  const categoryRows =
    input.scope === "all"
      ? []
      : await loadCategoryOptOuts(db, {
          limit: fetchLimit,
          q: input.q,
          before: cursor?.t ? new Date(cursor.t) : undefined,
        })

  const allRows =
    input.scope === "category"
      ? []
      : await loadListUnsubOptOuts(db, {
          limit: fetchLimit,
          q: input.q,
          before: cursor?.t ? new Date(cursor.t) : undefined,
        })

  const merged = [...categoryRows, ...allRows].sort((a, b) => {
    const timeDiff = Date.parse(b.occurred_at) - Date.parse(a.occurred_at)
    if (timeDiff !== 0) {
      return timeDiff
    }
    if (a.id !== b.id) {
      return a.id < b.id ? 1 : -1
    }
    return a.kind < b.kind ? 1 : -1
  })

  const filtered = cursor
    ? merged.filter((row) => afterCursor(row, cursor))
    : merged

  const page = filtered.slice(0, input.limit)
  const last = page.at(-1)
  const next = filtered.length > input.limit && last ? encodeCursor(last) : null

  return { data: page, next_cursor: next }
}

async function loadCategoryOptOuts(
  db: Database,
  input: { limit: number; q?: string; before?: Date }
): Promise<UnsubscribeOptOutJson[]> {
  const conditions: SQL[] = [
    eq(recipientPreference.optedOut, true),
    eq(recipientPreference.source, "unsubscribe_link"),
  ]
  if (input.q) {
    conditions.push(
      sql`(${recipient.email})::text ILIKE ${`%${escapeLike(input.q)}%`} ESCAPE '\\'`
    )
  }
  if (input.before) {
    conditions.push(lt(recipientPreference.updatedAt, input.before))
  }

  const rows = await db
    .select({
      id: recipientPreference.id,
      email: recipient.email,
      recipientId: recipient.id,
      categoryId: emailCategory.id,
      categoryKey: emailCategory.key,
      categoryName: emailCategory.name,
      source: recipientPreference.source,
      occurredAt: recipientPreference.updatedAt,
    })
    .from(recipientPreference)
    .innerJoin(recipient, eq(recipient.id, recipientPreference.recipientId))
    .innerJoin(
      emailCategory,
      eq(emailCategory.id, recipientPreference.categoryId)
    )
    .where(and(...conditions))
    .orderBy(desc(recipientPreference.updatedAt), desc(recipientPreference.id))
    .limit(input.limit)

  return rows.map((row) => ({
    id: row.id,
    kind: "category" as const,
    email: row.email,
    recipient_id: row.recipientId,
    category_id: row.categoryId,
    category_key: row.categoryKey,
    category_name: row.categoryName,
    source: row.source,
    occurred_at: row.occurredAt.toISOString(),
  }))
}

async function loadListUnsubOptOuts(
  db: Database,
  input: { limit: number; q?: string; before?: Date }
): Promise<UnsubscribeOptOutJson[]> {
  const conditions: SQL[] = [
    eq(suppressionEntry.scope, "list_unsub"),
    eq(suppressionEntry.source, "list_unsub"),
    isNull(suppressionEntry.removedAt),
  ]
  if (input.q) {
    conditions.push(
      sql`(${recipient.email})::text ILIKE ${`%${escapeLike(input.q)}%`} ESCAPE '\\'`
    )
  }
  if (input.before) {
    conditions.push(lt(suppressionEntry.createdAt, input.before))
  }

  const rows = await db
    .select({
      id: suppressionEntry.id,
      email: recipient.email,
      recipientId: suppressionEntry.recipientId,
      source: suppressionEntry.source,
      occurredAt: suppressionEntry.createdAt,
    })
    .from(suppressionEntry)
    .leftJoin(recipient, eq(recipient.id, suppressionEntry.recipientId))
    .where(and(...conditions))
    .orderBy(desc(suppressionEntry.createdAt), desc(suppressionEntry.id))
    .limit(input.limit)

  return rows.map((row) => ({
    id: row.id,
    kind: "all" as const,
    email: row.email,
    recipient_id: row.recipientId,
    category_id: null,
    category_key: null,
    category_name: null,
    source: row.source,
    occurred_at: row.occurredAt.toISOString(),
  }))
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
}
