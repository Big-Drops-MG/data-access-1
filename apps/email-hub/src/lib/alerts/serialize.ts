import type { Alert } from "@workspace/db"

const SECRET_KEY =
  /password|secret|apikey|privatekey|passphrase|authorization|cookie|token/

function canonicalKey(key: string): string {
  return key.toLowerCase().replaceAll("_", "").replaceAll("-", "")
}

function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(canonicalKey(key))
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return null
    }
    seen.add(value)
    return value.map((entry) => sanitizeValue(entry, seen))
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return null
    }
    seen.add(value)
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (isSecretKey(key) || child === undefined) {
        continue
      }
      out[key] = sanitizeValue(child, seen)
    }
    return out
  }
  return null
}

export type AlertJson = {
  id: string
  type: string
  severity: Alert["severity"]
  status: Alert["status"]
  dedupe_key: string | null
  payload: unknown
  opened_at: string
  resolved_at: string | null
  last_triggered_at: string
  occurrence_count: number
  acknowledged_by: string | null
  acknowledged_at: string | null
  created_at: string
  updated_at: string
}

function iso(value: Date): string {
  return value.toISOString()
}

export function serializeAlert(row: Alert): AlertJson {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    status: row.status,
    dedupe_key: row.dedupeKey,
    payload: sanitizeValue(row.payload, new WeakSet()),
    opened_at: iso(row.openedAt),
    resolved_at: row.resolvedAt ? iso(row.resolvedAt) : null,
    last_triggered_at: iso(row.lastTriggeredAt),
    occurrence_count: row.occurrenceCount,
    acknowledged_by: row.acknowledgedBy,
    acknowledged_at: row.acknowledgedAt ? iso(row.acknowledgedAt) : null,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  }
}
