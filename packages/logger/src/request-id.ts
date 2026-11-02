export const REQUEST_ID_HEADER = "x-request-id"

/** Long enough for a UUID and short enough to reject header abuse. */
export const MAX_REQUEST_ID_LENGTH = 128

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * Accept an incoming id only when it is a bounded token.
 * Anything else is replaced with crypto.randomUUID().
 * Assumption until SD#15.2 is available: validated inbound ids are trusted.
 */
export function isValidRequestId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(value)
  )
}

export function resolveRequestId(incoming: string | null | undefined): string {
  const trimmed = incoming?.trim() ?? ""
  if (isValidRequestId(trimmed)) {
    return trimmed
  }
  return crypto.randomUUID()
}
