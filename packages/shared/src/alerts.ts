import { alert, type Alert } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { getContextLogger, maskEmail } from "@workspace/logger"
import { and, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { AppError, isAppError } from "./errors.js"
import { isUniqueViolation } from "./postgres-errors.js"

type AlertDb = Database | DatabaseTransaction

const alertSeveritySchema = z.enum(["info", "warning", "critical"])
const alertTypeSchema = z.string().trim().min(1).max(128)
const alertDedupeKeySchema = z.string().trim().min(1).max(512)

export type AlertSeverity = z.infer<typeof alertSeveritySchema>

/**
 * Open an alert by logical identity.
 *
 * Identity is the existing partial unique index: one open row per `dedupeKey`.
 * A different `type` with the same open `dedupeKey` returns that row and does
 * not change its type. Severity on an existing open row is left as stored.
 * `refreshPayload` replaces payload on that row; it still does not change severity.
 * A resolved row is outside the unique index, so the same key can open again.
 */
export type OpenAlertInput = {
  type: string
  severity: AlertSeverity
  dedupeKey: string
  payload?: Record<string, unknown> | null
  now?: Date
  refreshPayload?: boolean
}

export type OpenAlertResult = {
  alert: Alert
  created: boolean
}

export type CloseAlertInput = {
  type: string
  dedupeKey: string
  now?: Date
}

export type CloseAlertResult = {
  alert: Alert | null
  closed: boolean
}

type NormalizedAlert = {
  type: string
  severity: AlertSeverity
  dedupeKey: string
  payload: Record<string, unknown> | null
  now: Date
  refreshPayload: boolean
}

const OPEN_DEDUPE_CONFLICT = sql`${alert.dedupeKey} IS NOT NULL AND ${alert.status} = 'open'`

function parseField<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw AppError.validationFailed(
      result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : path,
        message: issue.message,
      }))
    )
  }
  return result.data
}

function resolveNow(now: Date | undefined, path = "now"): Date {
  if (now === undefined) {
    return new Date()
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw AppError.validationFailed([{ path, message: "Invalid date" }])
  }
  return now
}

function assertPayload(
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (payload === undefined || payload === null) {
    return null
  }
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw AppError.validationFailed([
      { path: "payload", message: "Must be an object" },
    ])
  }
  return payload
}

function normalizeOpen(input: OpenAlertInput): NormalizedAlert {
  return {
    type: parseField(alertTypeSchema, input.type, "type"),
    severity: parseField(alertSeveritySchema, input.severity, "severity"),
    dedupeKey: parseField(alertDedupeKeySchema, input.dedupeKey, "dedupeKey"),
    payload: assertPayload(input.payload),
    now: resolveNow(input.now),
    refreshPayload: input.refreshPayload === true,
  }
}

function safeDedupeKey(value: string | null): string | null {
  if (!value) {
    return value
  }
  return value.replace(/[^\s@<>,"']+@[^\s@<>,"']+\.[^\s@<>,"']+/g, (match) =>
    maskEmail(match)
  )
}

function logAlertOpened(row: Alert): void {
  getContextLogger().info(
    {
      event: "alert.opened",
      alert_id: row.id,
      alert_type: row.type,
      severity: row.severity,
      dedupe_key: safeDedupeKey(row.dedupeKey),
    },
    "Alert opened"
  )
}

function logAlertClosed(row: Alert): void {
  getContextLogger().info(
    {
      event: "alert.closed",
      alert_id: row.id,
      alert_type: row.type,
      severity: row.severity,
      dedupe_key: safeDedupeKey(row.dedupeKey),
    },
    "Alert closed"
  )
}

function unresolvedConflict(): AppError {
  return AppError.conflict([
    {
      path: "dedupe_key",
      message: "Open alert conflict could not be resolved",
    },
  ])
}

async function insertOpenAlert(
  db: AlertDb,
  input: NormalizedAlert
): Promise<Alert | undefined> {
  const rows = await db
    .insert(alert)
    .values({
      type: input.type,
      severity: input.severity,
      status: "open",
      dedupeKey: input.dedupeKey,
      payload: input.payload,
      openedAt: input.now,
      lastTriggeredAt: input.now,
      occurrenceCount: 1,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({
      target: alert.dedupeKey,
      where: OPEN_DEDUPE_CONFLICT,
    })
    .returning()
  return rows[0]
}

async function findOpenAlert(
  db: AlertDb,
  dedupeKey: string
): Promise<Alert | undefined> {
  const [row] = await db
    .select()
    .from(alert)
    .where(and(eq(alert.dedupeKey, dedupeKey), eq(alert.status, "open")))
    .limit(1)
  return row
}

async function bumpOpenAlert(
  db: AlertDb,
  id: string,
  input: NormalizedAlert
): Promise<Alert | undefined> {
  const [row] = await db
    .update(alert)
    .set({
      lastTriggeredAt: input.now,
      occurrenceCount: sql`${alert.occurrenceCount} + 1`,
      updatedAt: input.now,
      ...(input.refreshPayload ? { payload: input.payload } : {}),
    })
    .where(and(eq(alert.id, id), eq(alert.status, "open")))
    .returning()
  return row
}

async function openNormalized(
  db: AlertDb,
  input: NormalizedAlert,
  attempt: number
): Promise<OpenAlertResult> {
  let uniqueError: unknown
  try {
    const created = await insertOpenAlert(db, input)
    if (created) {
      logAlertOpened(created)
      return { alert: created, created: true }
    }
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    uniqueError = error
  }

  try {
    const existing = await findOpenAlert(db, input.dedupeKey)
    if (!existing) {
      if (attempt < 1) {
        return openNormalized(db, input, attempt + 1)
      }
      throw unresolvedConflict()
    }
    const bumped = await bumpOpenAlert(db, existing.id, input)
    if (!bumped) {
      if (attempt < 1) {
        return openNormalized(db, input, attempt + 1)
      }
      throw unresolvedConflict()
    }
    return { alert: bumped, created: false }
  } catch (error) {
    if (uniqueError && !isAppError(error)) {
      throw uniqueError
    }
    throw error
  }
}

export async function openAlert(
  db: AlertDb,
  input: OpenAlertInput
): Promise<OpenAlertResult> {
  return openNormalized(db, normalizeOpen(input), 0)
}

async function findLatestAlert(
  db: AlertDb,
  type: string,
  dedupeKey: string
): Promise<Alert | undefined> {
  const [row] = await db
    .select()
    .from(alert)
    .where(and(eq(alert.type, type), eq(alert.dedupeKey, dedupeKey)))
    .orderBy(desc(alert.id))
    .limit(1)
  return row
}

/**
 * Resolve one open alert identified by type and dedupe key.
 * Already-resolved rows are returned unchanged. Acknowledgment columns are not cleared.
 */
export async function closeAlert(
  db: AlertDb,
  input: CloseAlertInput
): Promise<CloseAlertResult> {
  const type = parseField(alertTypeSchema, input.type, "type")
  const dedupeKey = parseField(
    alertDedupeKeySchema,
    input.dedupeKey,
    "dedupeKey"
  )
  const now = resolveNow(input.now)

  const [updated] = await db
    .update(alert)
    .set({
      status: "resolved",
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(alert.type, type),
        eq(alert.dedupeKey, dedupeKey),
        eq(alert.status, "open")
      )
    )
    .returning()

  if (updated) {
    logAlertClosed(updated)
    return { alert: updated, closed: true }
  }

  const existing = await findLatestAlert(db, type, dedupeKey)
  return { alert: existing ?? null, closed: false }
}
