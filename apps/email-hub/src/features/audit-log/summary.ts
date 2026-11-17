import { formatEtDateTime } from "@workspace/shared/client"

import type { AuditLogListItem } from "@/features/audit-log/api"
import { objectTypeLabel } from "@/features/audit-log/labels"

const DISPLAY_KEYS = [
  "name",
  "from_email",
  "email",
  "address",
  "local_part",
  "title",
  "label",
  "key",
  "domain",
  "mail_from_domain",
  "subject",
] as const

const ACTION_VERBS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  archive: "Archived",
  check: "Checked",
  claim: "Claimed",
  decide: "Decided",
  publish: "Published",
  acknowledged: "Acknowledged",
  remove: "Removed",
  rotate: "Rotated",
  revoke: "Revoked",
}

const FIELD_LABELS: Record<string, string> = {
  id: "Id",
  name: "Name",
  email: "Email",
  from_email: "From email",
  address: "Address",
  local_part: "Local part",
  title: "Title",
  label: "Label",
  key: "Key",
  domain: "Domain",
  mail_from_domain: "Mail-from domain",
  subject: "Subject",
  status: "Status",
  source: "Source",
  decision: "Decision",
  recipient_id: "Recipient",
  message_id: "Message",
  classification_id: "Classification",
  reviewing_by: "Reviewer",
  decided_by: "Decided by",
  locked_at: "Locked at",
  decided_at: "Decided at",
  created_at: "Created at",
  updated_at: "Updated at",
  request_id: "Request",
  dns_record_count: "DNS records",
}

/** Technical identity fields — show separately so the main change view stays readable. */
const TECHNICAL_KEYS = new Set([
  "id",
  "recipient_id",
  "message_id",
  "classification_id",
  "offer_id",
  "domain_id",
  "template_id",
  "sender_id",
  "user_id",
  "api_client_id",
  "reviewing_by",
  "decided_by",
  "created_by",
  "request_id",
])

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export type AuditFieldEntry = {
  key: string
  label: string
  value: string
  raw: unknown
  technical: boolean
  empty: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

const ACRONYMS = new Set(["api", "dns", "et", "fbl", "id", "ip", "sdk"])

function titleCaseWords(value: string): string {
  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) {
        return lower.toUpperCase()
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? titleCaseWords(key)
}

/** Best human label from an audit before/after payload. */
export function payloadDisplayName(value: unknown): string | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }
  for (const key of DISPLAY_KEYS) {
    const candidate = record[key]
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }
  return null
}

export function actionVerb(action: string): string {
  const parts = action.split(".")
  const raw = parts.length >= 2 ? parts.at(-1) : action
  if (!raw) {
    return "Changed"
  }
  return ACTION_VERBS[raw] ?? titleCaseWords(raw)
}

/** One-line story for the table, e.g. "Created mail.example.com". */
export function auditEventSummary(row: AuditLogListItem): string {
  const verb = actionVerb(row.action)
  const label = payloadDisplayName(row.after) ?? payloadDisplayName(row.before)
  if (label) {
    return `${verb} ${label}`
  }
  return `${verb} ${objectTypeLabel(row.object_type)}`
}

export function formatAuditValue(value: unknown): string {
  if (value == null) {
    return "—"
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }
  if (typeof value === "number") {
    return String(value)
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) {
      return "—"
    }
    if (ISO_DATE.test(trimmed)) {
      return formatEtDateTime(trimmed) || trimmed
    }
    if (
      trimmed.includes("_") &&
      !trimmed.includes(" ") &&
      !trimmed.includes("@")
    ) {
      return titleCaseWords(trimmed)
    }
    return trimmed
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function isEmptyAuditValue(value: unknown): boolean {
  if (value == null) {
    return true
  }
  if (typeof value === "string") {
    return value.trim() === ""
  }
  return false
}

export function auditPayloadEntries(value: unknown): AuditFieldEntry[] {
  const record = asRecord(value)
  if (!record) {
    return []
  }
  return Object.entries(record).map(([key, entryValue]) => ({
    key,
    label: fieldLabel(key),
    value: formatAuditValue(entryValue),
    raw: entryValue,
    technical: TECHNICAL_KEYS.has(key) || key.endsWith("_id"),
    empty: isEmptyAuditValue(entryValue),
  }))
}

export function partitionAuditFields(entries: AuditFieldEntry[]): {
  primary: AuditFieldEntry[]
  technical: AuditFieldEntry[]
} {
  const primary: AuditFieldEntry[] = []
  const technical: AuditFieldEntry[] = []
  for (const entry of entries) {
    if (entry.empty) {
      continue
    }
    if (entry.technical) {
      technical.push(entry)
    } else {
      primary.push(entry)
    }
  }
  return { primary, technical }
}

export function changedAuditKeys(before: unknown, after: unknown): Set<string> {
  const beforeRecord = asRecord(before) ?? {}
  const afterRecord = asRecord(after) ?? {}
  const keys = new Set([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord),
  ])
  const changed = new Set<string>()
  for (const key of keys) {
    const left = formatAuditValue(beforeRecord[key] ?? null)
    const right = formatAuditValue(afterRecord[key] ?? null)
    if (left !== right) {
      changed.add(key)
    }
  }
  return changed
}
