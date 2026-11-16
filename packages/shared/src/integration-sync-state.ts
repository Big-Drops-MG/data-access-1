import { integrationSyncState, type IntegrationSyncState } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { eq, sql } from "drizzle-orm"

import { closeAlert, openAlert } from "./alerts.js"
import { maskEmail } from "./email.js"
import { AppError } from "./errors.js"

type SyncDb = Database | DatabaseTransaction

export const INTEGRATION_DOWN_ALERT_TYPE = "integration_down" as const
export const INTEGRATION_FAILURES_TO_DOWN = 3 as const
export const INTEGRATION_NAME_MAX_LENGTH = 128 as const
export const INTEGRATION_ERROR_MAX_LENGTH = 2000 as const

export type IntegrationSyncStatusValue = "healthy" | "degraded" | "failed"

export type RecordIntegrationResultInput = {
  name: string
  ok: boolean
  error?: string | null
  now?: Date
}

export type RecordIntegrationResultOutcome = {
  state: IntegrationSyncState
  openedDownAlert: boolean
  closedDownAlert: boolean
}

const INTEGRATION_NAME_PATTERN = /^[a-z][a-z0-9_./:-]{0,127}$/

export function integrationDownAlertDedupeKey(name: string): string {
  return `integration:${normalizeIntegrationName(name)}`
}

export function normalizeIntegrationName(name: string): string {
  if (typeof name !== "string") {
    throw AppError.validationFailed([
      { path: "name", message: "Must be a string" },
    ])
  }
  const trimmed = name.trim().toLowerCase()
  if (
    trimmed.length === 0 ||
    trimmed.length > INTEGRATION_NAME_MAX_LENGTH ||
    !INTEGRATION_NAME_PATTERN.test(trimmed)
  ) {
    throw AppError.validationFailed([
      {
        path: "name",
        message:
          "Must be 1–128 chars, start with a letter, and use a-z, 0-9, _, ., /, :, or -",
      },
    ])
  }
  return trimmed
}

const SECRET_ASSIGNMENT =
  /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization|bearer|client[_-]?secret)\b\s*[:=]\s*([^\s,;]+)/gi
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const AWS_ACCESS_KEY = /\bAKIA[0-9A-Z]{16}\b/g
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+):([^/@\s]+)@/gi
const QUERY_SECRET =
  /([?&](?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|key)=)([^&\s]+)/gi

export function sanitizeIntegrationError(
  error: string | null | undefined
): string | null {
  if (error === undefined || error === null) {
    return null
  }
  if (typeof error !== "string") {
    throw AppError.validationFailed([
      { path: "error", message: "Must be a string" },
    ])
  }
  const trimmed = error.trim()
  if (trimmed.length === 0) {
    return null
  }
  const masked = trimmed
    .replace(URL_CREDENTIALS, "$1[REDACTED]:[REDACTED]@")
    .replace(QUERY_SECRET, "$1[REDACTED]")
    .replace(SECRET_ASSIGNMENT, "$1=[REDACTED]")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(AWS_ACCESS_KEY, "[REDACTED]")
    .replace(/[^\s@<>,"']+@[^\s@<>,"']+\.[^\s@<>,"']+/g, (match) =>
      maskEmail(match)
    )
  if (masked.length <= INTEGRATION_ERROR_MAX_LENGTH) {
    return masked
  }
  return masked.slice(0, INTEGRATION_ERROR_MAX_LENGTH)
}

export function statusAfterConsecutiveFailures(
  consecutiveFailures: number
): IntegrationSyncStatusValue {
  if (!Number.isInteger(consecutiveFailures) || consecutiveFailures < 0) {
    throw AppError.validationFailed([
      {
        path: "consecutiveFailures",
        message: "Must be a non-negative integer",
      },
    ])
  }
  if (consecutiveFailures <= 0) {
    return "healthy"
  }
  if (consecutiveFailures < INTEGRATION_FAILURES_TO_DOWN) {
    return "degraded"
  }
  return "failed"
}

export function nextFailureState(previousConsecutiveFailures: number): {
  consecutiveFailures: number
  status: Exclude<IntegrationSyncStatusValue, "healthy">
} {
  if (
    !Number.isInteger(previousConsecutiveFailures) ||
    previousConsecutiveFailures < 0
  ) {
    throw AppError.validationFailed([
      {
        path: "consecutiveFailures",
        message: "Must be a non-negative integer",
      },
    ])
  }
  const consecutiveFailures = previousConsecutiveFailures + 1
  return {
    consecutiveFailures,
    status:
      consecutiveFailures < INTEGRATION_FAILURES_TO_DOWN
        ? "degraded"
        : "failed",
  }
}

function resolveNow(now: Date | undefined): Date {
  if (now === undefined) {
    return new Date()
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw AppError.validationFailed([{ path: "now", message: "Invalid date" }])
  }
  return now
}

async function loadSyncState(
  db: SyncDb,
  key: string
): Promise<IntegrationSyncState | undefined> {
  const [row] = await db
    .select()
    .from(integrationSyncState)
    .where(eq(integrationSyncState.key, key))
    .limit(1)
  return row
}

async function writeSuccessState(
  db: SyncDb,
  key: string,
  now: Date
): Promise<IntegrationSyncState> {
  const [row] = await db
    .insert(integrationSyncState)
    .values({
      key,
      lastSuccessAt: now,
      lastAttemptAt: now,
      status: "healthy",
      lastError: null,
      consecutiveFailures: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: integrationSyncState.key,
      set: {
        lastSuccessAt: now,
        lastAttemptAt: now,
        status: "healthy",
        lastError: null,
        consecutiveFailures: 0,
        updatedAt: now,
      },
    })
    .returning()

  if (!row) {
    throw new Error("Failed to persist integration sync success state")
  }
  return row
}

async function writeFailureState(
  db: SyncDb,
  input: {
    key: string
    now: Date
    lastError: string
    previousConsecutiveFailures: number
  }
): Promise<IntegrationSyncState> {
  const next = nextFailureState(input.previousConsecutiveFailures)
  const [row] = await db
    .insert(integrationSyncState)
    .values({
      key: input.key,
      lastAttemptAt: input.now,
      status: next.status,
      lastError: input.lastError,
      consecutiveFailures: next.consecutiveFailures,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: integrationSyncState.key,
      set: {
        lastAttemptAt: input.now,
        status: next.status,
        lastError: input.lastError,
        consecutiveFailures: next.consecutiveFailures,
        updatedAt: input.now,
      },
    })
    .returning()

  if (!row) {
    throw new Error("Failed to persist integration sync failure state")
  }
  return row
}

async function recordIntegrationResultInDb(
  db: SyncDb,
  input: {
    key: string
    ok: boolean
    error: string | null
    now: Date
  }
): Promise<RecordIntegrationResultOutcome> {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${input.key}::text))`
  )

  if (input.ok) {
    const state = await writeSuccessState(db, input.key, input.now)
    const closed = await closeAlert(db, {
      type: INTEGRATION_DOWN_ALERT_TYPE,
      dedupeKey: integrationDownAlertDedupeKey(input.key),
      now: input.now,
    })
    return {
      state,
      openedDownAlert: false,
      closedDownAlert: closed.closed,
    }
  }

  const existing = await loadSyncState(db, input.key)
  const previousFailures = existing?.consecutiveFailures ?? 0
  const lastError = input.error ?? "integration failed"
  const state = await writeFailureState(db, {
    key: input.key,
    now: input.now,
    lastError,
    previousConsecutiveFailures: previousFailures,
  })

  if (state.status !== "failed") {
    return {
      state,
      openedDownAlert: false,
      closedDownAlert: false,
    }
  }

  const opened = await openAlert(db, {
    type: INTEGRATION_DOWN_ALERT_TYPE,
    severity: "critical",
    dedupeKey: integrationDownAlertDedupeKey(input.key),
    payload: {
      integration: input.key,
      consecutive_failures: state.consecutiveFailures,
      last_error: state.lastError,
    },
    now: input.now,
    refreshPayload: true,
  })

  return {
    state,
    openedDownAlert: opened.created,
    closedDownAlert: false,
  }
}

export async function recordIntegrationResult(
  db: SyncDb,
  name: string,
  ok: boolean,
  error?: string | null,
  now?: Date
): Promise<RecordIntegrationResultOutcome>
export async function recordIntegrationResult(
  db: SyncDb,
  input: RecordIntegrationResultInput
): Promise<RecordIntegrationResultOutcome>
export async function recordIntegrationResult(
  db: SyncDb,
  nameOrInput: string | RecordIntegrationResultInput,
  ok?: boolean,
  error?: string | null,
  now?: Date
): Promise<RecordIntegrationResultOutcome> {
  const input: RecordIntegrationResultInput =
    typeof nameOrInput === "string"
      ? { name: nameOrInput, ok: ok === true, error, now }
      : nameOrInput

  if (typeof input.ok !== "boolean") {
    throw AppError.validationFailed([
      { path: "ok", message: "Must be a boolean" },
    ])
  }

  const key = normalizeIntegrationName(input.name)
  const at = resolveNow(input.now)
  const sanitizedError = sanitizeIntegrationError(input.error)

  const run = (tx: SyncDb) =>
    recordIntegrationResultInDb(tx, {
      key,
      ok: input.ok,
      error: sanitizedError,
      now: at,
    })

  if (
    "transaction" in db &&
    typeof (db as Database).transaction === "function"
  ) {
    return (db as Database).transaction((tx) => run(tx))
  }

  return run(db)
}
