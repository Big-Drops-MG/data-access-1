import { and, desc, eq, isNull, lt, type SQL } from "drizzle-orm"

import { alert, type Alert } from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { AppError, writeAudit } from "@workspace/shared"

import { serializeAlert, type AlertJson } from "./serialize"

type Db = Database | DatabaseTransaction

export type AlertActor = {
  userId: string
  requestId?: string | null
}

export type ListAlertsInput = {
  limit: number
  cursor?: string
  status?: Alert["status"]
  severity?: Alert["severity"]
  type?: string
}

function auditSnapshot(row: Alert): Record<string, string | number | null> {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    status: row.status,
    dedupe_key: row.dedupeKey,
    opened_at: row.openedAt.toISOString(),
    resolved_at: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    acknowledged_by: row.acknowledgedBy,
    acknowledged_at: row.acknowledgedAt
      ? row.acknowledgedAt.toISOString()
      : null,
    occurrence_count: row.occurrenceCount,
  }
}

function notFound(): AppError {
  return AppError.notFound([{ path: "id", message: "Alert not found" }])
}

async function findAlert(db: Db, id: string): Promise<Alert | undefined> {
  const [row] = await db.select().from(alert).where(eq(alert.id, id)).limit(1)
  return row
}

export async function listAlerts(
  input: ListAlertsInput,
  db: Database = getDb()
): Promise<{ data: AlertJson[]; next_cursor: string | null }> {
  const conditions: SQL[] = []
  if (input.status) {
    conditions.push(eq(alert.status, input.status))
  }
  if (input.severity) {
    conditions.push(eq(alert.severity, input.severity))
  }
  if (input.type) {
    conditions.push(eq(alert.type, input.type))
  }
  if (input.cursor) {
    conditions.push(lt(alert.id, input.cursor))
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = await db
    .select()
    .from(alert)
    .where(where)
    .orderBy(desc(alert.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  const next = rows.length > input.limit ? (last?.id ?? null) : null

  return {
    data: page.map((row) => serializeAlert(row)),
    next_cursor: next,
  }
}

/**
 * Record the first acknowledgment. A later call keeps the original actor.
 * Acknowledgment does not change status or resolved_at, including when the
 * alert is already resolved.
 */
export async function acknowledgeAlert(
  id: string,
  actor: AlertActor,
  db: Database = getDb()
): Promise<AlertJson> {
  return db.transaction(async (tx) => {
    const existing = await findAlert(tx, id)
    if (!existing) {
      throw notFound()
    }
    if (existing.acknowledgedAt) {
      return serializeAlert(existing)
    }

    const now = new Date()
    const [updated] = await tx
      .update(alert)
      .set({
        acknowledgedBy: actor.userId,
        acknowledgedAt: now,
        updatedAt: now,
      })
      .where(and(eq(alert.id, id), isNull(alert.acknowledgedAt)))
      .returning()

    if (!updated) {
      const raced = await findAlert(tx, id)
      if (!raced) {
        throw notFound()
      }
      return serializeAlert(raced)
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "alert.acknowledged",
      objectType: "alert",
      objectId: updated.id,
      requestId: actor.requestId,
      before: auditSnapshot(existing),
      after: auditSnapshot(updated),
    })

    return serializeAlert(updated)
  })
}
