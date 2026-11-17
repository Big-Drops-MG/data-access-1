import { and, desc, eq, gte, isNull, lt, type SQL } from "drizzle-orm"

import { auditLog, type AuditLog } from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import { getEtDayRange, getEtReportRange } from "@workspace/shared"

import { serializeAuditLog, type AuditLogJson } from "./serialize"

export type ListAuditLogInput = {
  limit: number
  cursor?: string
  actorType?: AuditLog["actorType"]
  actorId?: string
  action?: string
  objectType?: string
  objectId?: string
  from?: string
  to?: string
}

function dateRangeCondition(from?: string, to?: string): SQL | undefined {
  if (from && to) {
    const range = getEtReportRange(from, to)
    return and(
      gte(auditLog.createdAt, range.start),
      lt(auditLog.createdAt, range.endExclusive)
    )
  }
  if (from) {
    const range = getEtDayRange(from)
    return gte(auditLog.createdAt, range.start)
  }
  if (to) {
    const range = getEtDayRange(to)
    return lt(auditLog.createdAt, range.endExclusive)
  }
  return undefined
}

export async function listAuditLog(
  input: ListAuditLogInput,
  db: Database = getDb()
): Promise<{ data: AuditLogJson[]; next_cursor: string | null }> {
  const conditions: SQL[] = []

  if (input.actorType) {
    conditions.push(eq(auditLog.actorType, input.actorType))
  }
  if (input.actorId) {
    conditions.push(eq(auditLog.actorId, input.actorId))
  } else if (input.actorType === "system") {
    conditions.push(isNull(auditLog.actorId))
  }
  if (input.action) {
    conditions.push(eq(auditLog.action, input.action))
  }
  if (input.objectType) {
    conditions.push(eq(auditLog.entityType, input.objectType))
  }
  if (input.objectId) {
    conditions.push(eq(auditLog.entityId, input.objectId))
  }
  const dateCondition = dateRangeCondition(input.from, input.to)
  if (dateCondition) {
    conditions.push(dateCondition)
  }
  if (input.cursor) {
    conditions.push(lt(auditLog.id, input.cursor))
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  const next = rows.length > input.limit ? (page.at(-1)?.id ?? null) : null

  return {
    data: page.map(serializeAuditLog),
    next_cursor: next,
  }
}
