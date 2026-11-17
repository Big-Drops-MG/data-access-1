import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  type SQL,
} from "drizzle-orm"

import { apiClient, auditLog, user, type AuditLog } from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import { getEtDayRange, getEtReportRange } from "@workspace/shared"

import {
  serializeAuditLog,
  type AuditActorOptionJson,
  type AuditLogJson,
} from "./serialize"

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

function actorNameFallback(row: AuditLog): string {
  if (row.actorType === "system") {
    return "System"
  }
  if (row.actorType === "api_client") {
    return "API client"
  }
  return "User"
}

async function resolveActorNames(
  rows: AuditLog[],
  db: Database
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const userIds = [
    ...new Set(
      rows
        .filter((row) => row.actorType === "user" && row.actorId)
        .map((row) => row.actorId as string)
    ),
  ]
  const clientIds = [
    ...new Set(
      rows
        .filter((row) => row.actorType === "api_client" && row.actorId)
        .map((row) => row.actorId as string)
    ),
  ]

  if (userIds.length > 0) {
    const users = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, userIds))
    for (const row of users) {
      names.set(`user:${row.id}`, row.name)
    }
  }

  if (clientIds.length > 0) {
    const clients = await db
      .select({ id: apiClient.id, name: apiClient.name })
      .from(apiClient)
      .where(inArray(apiClient.id, clientIds))
    for (const row of clients) {
      names.set(`api_client:${row.id}`, row.name)
    }
  }

  return names
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
  const names = await resolveActorNames(page, db)

  return {
    data: page.map((row) => {
      const key = row.actorId != null ? `${row.actorType}:${row.actorId}` : null
      const actorName = (key ? names.get(key) : null) ?? actorNameFallback(row)
      return serializeAuditLog(row, actorName)
    }),
    next_cursor: next,
  }
}

/** Actors for the audit log filter picker (Operator+). */
export async function listAuditActors(
  db: Database = getDb()
): Promise<{ data: AuditActorOptionJson[] }> {
  const [users, clients] = await Promise.all([
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .orderBy(asc(user.name))
      .limit(200),
    db
      .select({ id: apiClient.id, name: apiClient.name })
      .from(apiClient)
      .orderBy(asc(apiClient.name))
      .limit(200),
  ])

  return {
    data: [
      ...users.map((row) => ({
        id: row.id,
        type: "user" as const,
        name: row.name,
      })),
      ...clients.map((row) => ({
        id: row.id,
        type: "api_client" as const,
        name: row.name,
      })),
    ],
  }
}
