import { AppError } from "./errors.js"

/** Postgres unique_violation */
export const PG_UNIQUE_VIOLATION = "23505"
/** Postgres foreign_key_violation */
export const PG_FOREIGN_KEY_VIOLATION = "23503"

function readCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined
  }
  if ("code" in error && typeof error.code === "string") {
    return error.code
  }
  return undefined
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
    const code = readCode(current)
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

/**
 * SD#15.6: unique / foreign-key violations → 409 `conflict`.
 * Returns null when the error is not a mapped constraint violation.
 */
export function appErrorFromPostgresConstraint(
  error: unknown
): AppError | null {
  const code = getPostgresErrorCode(error)
  if (code === PG_UNIQUE_VIOLATION || code === PG_FOREIGN_KEY_VIOLATION) {
    return AppError.conflict()
  }
  return null
}
