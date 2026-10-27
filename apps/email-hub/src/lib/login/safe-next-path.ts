/**
 * SD#14.3 / T-031 — `next` must be a same-origin relative path starting with
 * a single `/`. Anything else (protocol-relative, absolute URL, empty) is ignored.
 */
export const DEFAULT_POST_LOGIN_PATH = "/dashboard"

export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_POST_LOGIN_PATH
): string {
  if (raw == null) {
    return fallback
  }

  let value = raw.trim()
  if (!value) {
    return fallback
  }

  try {
    value = decodeURIComponent(value)
  } catch {
    return fallback
  }

  value = value.trim()
  if (!value.startsWith("/")) {
    return fallback
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return fallback
  }
  if (value.includes("://")) {
    return fallback
  }
  if (value.includes("\\")) {
    return fallback
  }

  return value
}
