import type { SerializedError } from "./types.js"

const CREDENTIAL_URL = /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]*):([^/\s@]+)@/gi

const MAX_CAUSE_DEPTH = 4

/** Replace userinfo in URLs. This is not a general secret scanner. */
export function scrubCredentialUrls(value: string): string {
  return value.replace(CREDENTIAL_URL, "$1[REDACTED]@")
}

function stackAllowed(): boolean {
  if (process.env.EMAILHUB_ENV === "prod") {
    return false
  }
  if (process.env.NODE_ENV === "production") {
    return false
  }
  return true
}

function readErrorCode(error: Error): string | undefined {
  if (!("code" in error)) {
    return undefined
  }
  const code = (error as { code?: unknown }).code
  if (typeof code === "string" && code.length > 0 && code.length <= 64) {
    return code
  }
  if (typeof code === "number" && Number.isFinite(code)) {
    return String(code)
  }
  return undefined
}

export function serializeError(error: unknown, depth = 0): SerializedError {
  if (depth > MAX_CAUSE_DEPTH) {
    return { type: "error", message: "Cause chain truncated" }
  }

  if (error instanceof Error) {
    const serialized: SerializedError = {
      type: error.name || "Error",
      message: scrubCredentialUrls(error.message),
    }
    const code = readErrorCode(error)
    if (code) {
      serialized.error_code = code
    }
    if (stackAllowed() && error.stack) {
      serialized.stack = scrubCredentialUrls(error.stack)
    }
    if (error.cause !== undefined && error.cause !== error) {
      serialized.cause = serializeError(error.cause, depth + 1)
    }
    return serialized
  }

  if (typeof error === "string") {
    return { type: "string", message: scrubCredentialUrls(error) }
  }

  return { type: "unknown", message: "Non-error thrown" }
}
