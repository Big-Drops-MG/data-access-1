import { and, desc, eq } from "drizzle-orm"

import { auditLog } from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import type { RecipientImportInvalidRow } from "@workspace/shared/recipient-csv-ingest"

export type RecipientImportLatestJson = {
  upload_id: string
  completed_at: string
  rows_read: number
  added: number
  updated: number
  skipped: number
  invalid: number
  invalid_rows: RecipientImportInvalidRow[]
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function asInvalidRows(value: unknown): RecipientImportInvalidRow[] {
  if (!Array.isArray(value)) {
    return []
  }
  const rows: RecipientImportInvalidRow[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue
    }
    const row = item as Record<string, unknown>
    if (
      typeof row.row !== "number" ||
      typeof row.column !== "string" ||
      typeof row.problem !== "string"
    ) {
      continue
    }
    rows.push({
      row: row.row,
      column: row.column,
      problem: row.problem,
    })
  }
  return rows
}

export async function getLatestRecipientImport(
  db: Database = getDb()
): Promise<RecipientImportLatestJson | null> {
  const [row] = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "recipient.import.completed"),
        eq(auditLog.entityType, "recipient_import")
      )
    )
    .orderBy(desc(auditLog.id))
    .limit(1)

  if (!row) {
    return null
  }

  const after =
    row.after && typeof row.after === "object"
      ? (row.after as Record<string, unknown>)
      : {}

  return {
    upload_id:
      typeof after.upload_id === "string" && after.upload_id.length > 0
        ? after.upload_id
        : (row.entityId ?? ""),
    completed_at: row.createdAt.toISOString(),
    rows_read: asCount(after.rows_read),
    added: asCount(after.added),
    updated: asCount(after.updated),
    skipped: asCount(after.skipped),
    invalid: asCount(after.invalid),
    invalid_rows: asInvalidRows(after.invalid_rows),
  }
}
