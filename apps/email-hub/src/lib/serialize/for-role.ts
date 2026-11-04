import { maskEmail } from "@workspace/shared"

import type { AppRole } from "@/lib/permissions"

const EMAIL_KEY =
  /^(email|from_email|fromEmail|reply_to|replyTo|recipient_email|recipientEmail|to_email|toEmail)$/i

const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function looksLikeEmail(value: string): boolean {
  return EMAIL_VALUE.test(value.trim())
}

function maskValue(key: string | null, value: unknown): unknown {
  if (typeof value === "string") {
    if ((key && EMAIL_KEY.test(key)) || looksLikeEmail(value)) {
      return maskEmail(value)
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => maskValue(null, entry))
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      out[childKey] = maskValue(childKey, childValue)
    }
    return out
  }

  return value
}

/**
 * Viewer serializer (SD#14.3): mask emails in API payloads.
 * Operators and Admins receive the data unchanged.
 */
export function serializeForRole<T>(role: AppRole, data: T): T {
  if (role !== "viewer") {
    return data
  }
  return maskValue(null, data) as T
}
