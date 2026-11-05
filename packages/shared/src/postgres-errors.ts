import { AppError } from "./errors.js"

/** Postgres unique_violation */
export const PG_UNIQUE_VIOLATION = "23505"
/** Postgres foreign_key_violation */
export const PG_FOREIGN_KEY_VIOLATION = "23503"
/** Postgres raise_exception */
export const PG_RAISE_EXCEPTION = "P0001"

function readString(
  error: object,
  key: "code" | "message"
): string | undefined {
  const value = (error as Record<string, unknown>)[key]
  return typeof value === "string" ? value : undefined
}

/** Walk Drizzle/node-pg `cause` chains for a SQLSTATE code. */
export function getPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  const seen = new Set<unknown>()
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)
    const code = readString(current, "code")
    if (code) {
      return code
    }
    if ("cause" in current) {
      current = current.cause
      continue
    }
    break
  }
  return undefined
}

export function isUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === PG_UNIQUE_VIOLATION
}

export function isForeignKeyViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === PG_FOREIGN_KEY_VIOLATION
}

function chainIncludesMessage(error: unknown, needle: string): boolean {
  let current: unknown = error
  const seen = new Set<unknown>()
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)
    if (readString(current, "message")?.includes(needle)) {
      return true
    }
    if ("cause" in current) {
      current = current.cause
      continue
    }
    break
  }
  return false
}

/**
 * Unique and foreign-key violations, and the send edit-lock trigger,
 * become 409 `conflict`. Other errors stay unmapped.
 */
export function appErrorFromPostgresConstraint(
  error: unknown
): AppError | null {
  const code = getPostgresErrorCode(error)
  if (code === PG_UNIQUE_VIOLATION || code === PG_FOREIGN_KEY_VIOLATION) {
    return AppError.conflict()
  }
  if (
    code === PG_RAISE_EXCEPTION &&
    chainIncludesMessage(error, "send can only be edited")
  ) {
    return AppError.conflict([
      { path: "status", message: "Send configuration is locked" },
    ])
  }
  return null
}
