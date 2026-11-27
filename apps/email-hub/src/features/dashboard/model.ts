import { formatEtDate } from "@workspace/shared/client"

import type { AlertJson } from "@/lib/alerts/serialize"
import type { DashboardIntegration } from "@/features/dashboard/api"
import type { SendJson } from "@/lib/sends/serialize"

export type SendingRow = {
  day: string
  sent: number
  delivered: number
  bounce_hard: number
  bounce_soft: number
  complaint: number
}

export type EngagementRow = {
  day: string
  opens: number
  clicks: number
  unsubscribes: number
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return 0
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value)
}

export function shortDayLabel(iso: string): string {
  const [, month, day] = iso.split("-")
  const label = MONTHS[Number(month) - 1]
  if (!label || !day) {
    return iso
  }
  return `${label} ${Number(day)}`
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function reportWindow(
  days: number,
  now = new Date()
): { from: string; to: string } {
  const to = formatEtDate(now)
  const [year, month, day] = to.split("-").map(Number)
  const utc = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1))
  utc.setUTCDate(utc.getUTCDate() - (days - 1))
  return { from: formatUtcDate(utc), to }
}

export function normalizeSendingRows(
  data: Record<string, unknown>[]
): SendingRow[] {
  return data.map((row) => ({
    day: asText(row.day).slice(0, 10),
    sent: asCount(row.sent),
    delivered: asCount(row.delivered),
    bounce_hard: asCount(row.bounce_hard),
    bounce_soft: asCount(row.bounce_soft),
    complaint: asCount(row.complaint),
  }))
}

export function normalizeEngagementRows(
  data: Record<string, unknown>[]
): EngagementRow[] {
  return data.map((row) => ({
    day: asText(row.day).slice(0, 10),
    opens: asCount(row.opens),
    clicks: asCount(row.clicks),
    unsubscribes: asCount(row.unsubscribes),
  }))
}

export const BOUNCE_WARN_PERCENT = 2
export const BOUNCE_PAUSE_PERCENT = 4
export const COMPLAINT_WARN_PERCENT = 0.05
export const COMPLAINT_PAUSE_PERCENT = 0.08
export const OPEN_WATCH_PERCENT = 15
export const OPEN_TARGET_PERCENT = 20
export const CLICK_WATCH_PERCENT = 2
export const CLICK_TARGET_PERCENT = 3
export const UNSUBSCRIBE_WATCH_PERCENT = 0.2
export const UNSUBSCRIBE_PAUSE_PERCENT = 0.3

export type ScheduleFilter = "all" | "upcoming" | "completed"

export type RangeSummary = {
  sent: number
  delivered: number
  bounced: number
  complaints: number
  bounceRate: number | null
  complaintRate: number | null
  openRate: number | null
  clickRate: number | null
  unsubscribeRate: number | null
}

export type SentDay = {
  day: string
  label: string
  sent: number
}

export type MeterTone = "ok" | "warn" | "err" | "neutral"

export type IntegrationTone = "ok" | "err" | "neutral"

export type IntegrationView = {
  id: string
  name: string
  detail: string
  label: "Healthy" | "Degraded" | "Failed" | "No check"
  tone: IntegrationTone
}

const UPCOMING_STATUSES = new Set(["scheduled", "queued", "dispatching"])

type SyncStatus = DashboardIntegration["status"] | "unknown"

function rate(part: number, whole: number): number | null {
  if (whole <= 0) {
    return null
  }
  return part / whole
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number)
  const cursor = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1))
  cursor.setUTCDate(cursor.getUTCDate() + days)
  const nextYear = cursor.getUTCFullYear()
  const nextMonth = String(cursor.getUTCMonth() + 1).padStart(2, "0")
  const nextDay = String(cursor.getUTCDate()).padStart(2, "0")
  return `${nextYear}-${nextMonth}-${nextDay}`
}

export function eachDay(from: string, to: string): string[] {
  const days: string[] = []
  let cursor = from
  while (cursor <= to && days.length < 120) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

export function summarizeRange(
  sending: SendingRow[],
  engagement: EngagementRow[] | null
): RangeSummary {
  let sent = 0
  let delivered = 0
  let bounced = 0
  let complaints = 0
  for (const row of sending) {
    sent += row.sent
    delivered += row.delivered
    bounced += row.bounce_hard + row.bounce_soft
    complaints += row.complaint
  }

  let opens = 0
  let clicks = 0
  let unsubscribes = 0
  if (engagement) {
    for (const row of engagement) {
      opens += row.opens
      clicks += row.clicks
      unsubscribes += row.unsubscribes
    }
  }

  return {
    sent,
    delivered,
    bounced,
    complaints,
    bounceRate: rate(bounced, sent),
    complaintRate: rate(complaints, sent),
    openRate: engagement ? rate(opens, delivered) : null,
    clickRate: engagement ? rate(clicks, delivered) : null,
    unsubscribeRate: engagement ? rate(unsubscribes, delivered) : null,
  }
}

export function sentPerDay(
  from: string,
  to: string,
  sending: SendingRow[]
): SentDay[] {
  const totals = new Map<string, number>()
  for (const row of sending) {
    totals.set(row.day, (totals.get(row.day) ?? 0) + row.sent)
  }
  return eachDay(from, to).map((day) => ({
    day,
    label: shortDayLabel(day),
    sent: totals.get(day) ?? 0,
  }))
}

export function chartAxis(maxValue: number): { max: number; mid: number } {
  if (maxValue <= 0) {
    return { max: 1, mid: 0 }
  }
  const exponent = Math.floor(Math.log10(maxValue))
  const power = 10 ** exponent
  const fraction = maxValue / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  const max = nice * power
  return { max, mid: max / 2 }
}

export function formatRate(rateValue: number | null): string {
  if (rateValue == null || !Number.isFinite(rateValue)) {
    return "—"
  }
  const percent = rateValue * 100
  const digits = percent >= 10 ? 1 : percent >= 0.1 ? 2 : 3
  const fixed = percent.toFixed(digits)
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed
  return `${trimmed}%`
}

export function formatAxis(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value)
}

export function meterFill(
  rateValue: number | null,
  ceilingPercent: number
): number {
  if (rateValue == null || ceilingPercent <= 0) {
    return 0
  }
  return Math.min(100, Math.max(0, ((rateValue * 100) / ceilingPercent) * 100))
}

export function limitTone(
  rateValue: number | null,
  warnPercent: number,
  pausePercent: number
): MeterTone {
  if (rateValue == null) {
    return "neutral"
  }
  const percent = rateValue * 100
  if (percent >= pausePercent) {
    return "err"
  }
  if (percent >= warnPercent) {
    return "warn"
  }
  return "ok"
}

export function targetTone(
  rateValue: number | null,
  watchPercent: number,
  targetPercent: number
): MeterTone {
  if (rateValue == null) {
    return "neutral"
  }
  const percent = rateValue * 100
  if (percent >= targetPercent) {
    return "ok"
  }
  if (percent >= watchPercent) {
    return "warn"
  }
  return "err"
}

export function alertHeadline(
  alert: Pick<AlertJson, "type" | "payload">
): string {
  const payload = alert.payload
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>
    for (const key of ["reason", "message", "summary"]) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
    }
  }
  const words = alert.type.replaceAll("_", " ").replaceAll(".", " ").trim()
  if (!words) {
    return "Alert"
  }
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function sendWhen(send: SendJson): number {
  const value = send.completed_at ?? send.scheduled_for
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

export function dashboardSends(
  recent: SendJson[],
  upcoming: SendJson[],
  filter: ScheduleFilter
): SendJson[] {
  const seen = new Set<string>()
  const rows = [...upcoming, ...recent].filter((send) => {
    if (seen.has(send.id)) {
      return false
    }
    seen.add(send.id)
    if (filter === "upcoming") {
      return UPCOMING_STATUSES.has(send.status)
    }
    if (filter === "completed") {
      return send.status === "completed"
    }
    return true
  })
  return rows.sort((left, right) => sendWhen(right) - sendWhen(left))
}

function rank(status: SyncStatus): number {
  if (status === "failed") {
    return 3
  }
  if (status === "degraded") {
    return 2
  }
  if (status === "healthy") {
    return 1
  }
  return 0
}

function worse(left: SyncStatus, right: SyncStatus): SyncStatus {
  return rank(left) >= rank(right) ? left : right
}

function statusFromAlerts(alerts: AlertJson[], pattern: RegExp): SyncStatus {
  let status: SyncStatus = "unknown"
  for (const alert of alerts) {
    if (!pattern.test(alert.type)) {
      continue
    }
    const failed =
      alert.severity === "critical" ||
      /critical|disabled|restricted/.test(alert.type)
    status = worse(status, failed ? "failed" : "degraded")
  }
  return status
}

function statusFromKeys(
  integrations: DashboardIntegration[],
  keys: string[]
): { status: SyncStatus; row: DashboardIntegration | null } {
  let status: SyncStatus = "unknown"
  let row: DashboardIntegration | null = null
  for (const item of integrations) {
    if (!keys.includes(item.key)) {
      continue
    }
    status = worse(status, item.status)
    if (!row || rank(item.status) >= rank(row.status)) {
      row = item
    }
  }
  return { status, row }
}

function viewFor(
  id: string,
  name: string,
  fallback: string,
  status: SyncStatus,
  row: DashboardIntegration | null,
  alert: AlertJson | undefined,
  formatWhen: (iso: string) => string
): IntegrationView {
  const label =
    status === "healthy"
      ? "Healthy"
      : status === "degraded"
        ? "Degraded"
        : status === "failed"
          ? "Failed"
          : "No check"
  const tone: IntegrationTone =
    status === "healthy" ? "ok" : status === "unknown" ? "neutral" : "err"
  let detail = fallback
  if (status !== "healthy" && status !== "unknown") {
    detail =
      row?.last_error?.trim() || (alert ? alertHeadline(alert) : fallback)
  } else if (status === "healthy" && row?.last_success_at) {
    detail = `Last success ${formatWhen(row.last_success_at)}`
  }
  return { id, name, detail, label, tone }
}

function firstAlert(
  alerts: AlertJson[],
  pattern: RegExp
): AlertJson | undefined {
  return alerts.find((alert) => pattern.test(alert.type))
}

const KNOWN_KEYS = new Set(["optizmo", "google_postmaster", "snds"])

const EXTRA_COPY: Record<string, { name: string; detail: string }> = {
  everflow: { name: "Everflow", detail: "Offer import" },
  arohaa_webhook: { name: "Arohaa webhook", detail: "Recipient tier updates" },
}

export function buildIntegrationItems(input: {
  integrations: DashboardIntegration[]
  alerts: AlertJson[]
  analytics: "pending" | "ok" | "error"
  formatWhen: (iso: string) => string
}): IntegrationView[] {
  const sesPattern = /^ses_/
  const webhookPattern = /webhook/
  const optizmoPattern = /optizmo/
  const mailboxPattern = /fbl|imap|mailbox/
  const postmasterPattern = /postmaster|snds|provider_credentials/

  const ses = statusFromAlerts(input.alerts, sesPattern)
  const webhook = statusFromAlerts(input.alerts, webhookPattern)
  const optizmoSync = statusFromKeys(input.integrations, ["optizmo"])
  const optizmo = worse(
    optizmoSync.status,
    statusFromAlerts(input.alerts, optizmoPattern)
  )
  const mailbox = statusFromAlerts(input.alerts, mailboxPattern)
  const postmasterSync = statusFromKeys(input.integrations, [
    "google_postmaster",
    "snds",
  ])
  const postmaster = worse(
    postmasterSync.status,
    statusFromAlerts(input.alerts, postmasterPattern)
  )
  const analyticsStatus: SyncStatus =
    input.analytics === "ok"
      ? "healthy"
      : input.analytics === "error"
        ? "degraded"
        : "unknown"

  const items: IntegrationView[] = [
    viewFor(
      "ses",
      "Amazon SES account",
      "Sending account and reputation",
      ses,
      null,
      firstAlert(input.alerts, sesPattern),
      input.formatWhen
    ),
    viewFor(
      "ses-webhook",
      "SES events webhook",
      "Delivery, bounce, and complaint events",
      webhook,
      null,
      firstAlert(input.alerts, webhookPattern),
      input.formatWhen
    ),
    viewFor(
      "optizmo",
      "Optizmo sync",
      "Suppression list sync",
      optizmo,
      optizmoSync.row,
      firstAlert(input.alerts, optizmoPattern),
      input.formatWhen
    ),
    viewFor(
      "analytics",
      "Analytics feed",
      input.analytics === "pending"
        ? "Checking sending stats"
        : input.analytics === "error"
          ? "Sending stats could not be loaded"
          : "Daily sending stats",
      analyticsStatus,
      null,
      undefined,
      input.formatWhen
    ),
    viewFor(
      "imap",
      "Report mailbox (IMAP)",
      "Complaint mailbox",
      mailbox,
      null,
      firstAlert(input.alerts, mailboxPattern),
      input.formatWhen
    ),
    viewFor(
      "postmaster",
      "Postmaster and SNDS",
      "Gmail and Microsoft feedback",
      postmaster,
      postmasterSync.row,
      firstAlert(input.alerts, postmasterPattern),
      input.formatWhen
    ),
  ]

  const extras = input.integrations
    .filter((item) => !KNOWN_KEYS.has(item.key))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item) => {
      const copy = EXTRA_COPY[item.key]
      const name =
        copy?.name ??
        item.key
          .replaceAll("_", " ")
          .replace(/^\w/, (char) => char.toUpperCase())
      return viewFor(
        item.key,
        name,
        copy?.detail ?? "Integration check",
        item.status,
        item,
        undefined,
        input.formatWhen
      )
    })

  return [...items, ...extras]
}
