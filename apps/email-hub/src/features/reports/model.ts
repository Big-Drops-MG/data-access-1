import { formatEtDate } from "@workspace/shared/client"

export const DISPLAYED_EMAIL_CLIENTS = [
  "Apple Mail",
  "Gmail",
  "Outlook",
  "Yahoo Mail",
] as const

export const OTHER_EMAIL_CLIENT = "Other"

export function clientGroupLabel(raw: string): string {
  const normalized = raw.trim().toLowerCase()
  const match = DISPLAYED_EMAIL_CLIENTS.find(
    (name) => name.toLowerCase() === normalized
  )
  return match ?? OTHER_EMAIL_CLIENT
}

export type SendingRow = {
  day: string
  sending_domain: string
  provider: string
  email_type: string
  sent: number
  delivered: number
  bounce_hard: number
  bounce_soft: number
  complaint: number
}

export type EngagementRow = {
  day: string
  sending_domain: string
  provider: string
  email_type: string
  opens: number
  unique_opens: number
  clicks: number
  unique_clicks: number
  unsubscribes: number
}

export type LinkClickRow = {
  link_url: string
  clicks: number
}

export type EnvironmentRow = {
  client: string
  device_type: string
  os: string
  country: string
  region: string
  opens: number
  clicks: number
  unsubscribes: number
}

export type OpenFrequencyRow = {
  bucket: string
  recipients: number
}

export type ProviderMetricRow = {
  provider: string
  target: string
  metric: string
  day: string
  value: number
}

export type VolumeRow = {
  key: string
  label: string
  sent: number
  delivered: number
  bounced: number
  opens: number
  clicks: number
  unsubscribes: number
  bounceRate: number | null
}

export type SendView = {
  kpis: {
    sent: number
    deliveredRate: number | null
    bouncedRate: number | null
    complaints: number
    unsubscribes: number
  }
  daily: Array<{
    day: string
    label: string
    delivered: number
    bounced: number
  }>
  domains: VolumeRow[]
  days: VolumeRow[]
}

export type EngagementView = {
  frequency: Array<{ bucket: string; label: string; recipients: number }>
  clients: Array<{ label: string; opens: number; share: number }>
  links: Array<{ url: string; clicks: number }>
  unsubscribes: Array<{
    label: string
    delivered: number
    unsubscribed: number
    rate: number | null
  }>
  devices: Array<{ label: string; opens: number; clicks: number }>
  locations: Array<{ label: string; clicks: number; unsubscribes: number }>
}

export type ProviderPostmasterRow = {
  domain: string
  reputation: string
  reputationTone: "ok" | "warn" | "err" | "neutral"
  spamRate: number | null
  pulled: string
}

export type ProviderSourceRow = {
  source: string
  reports: string
  summary: string
  healthy: boolean
}

export type ProviderView = {
  domains: string[]
  selectedDomain: string | null
  spamSeries: Array<{ day: string; label: string; rate: number }>
  postmaster: ProviderPostmasterRow[]
  sources: ProviderSourceRow[]
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

const FREQUENCY_BUCKETS = [
  { bucket: "1", label: "Opened once" },
  { bucket: "2", label: "2 times" },
  { bucket: "3", label: "3 times" },
  { bucket: "4", label: "4 times" },
  { bucket: "5", label: "5 times" },
  { bucket: "8+", label: "8 or more" },
] as const

const REPUTATION_LABELS: Record<number, string> = {
  4: "High",
  3: "Medium",
  2: "Low",
  1: "Bad",
}

const SOURCE_COPY: Record<string, { source: string; reports: string }> = {
  google_postmaster: {
    source: "Google Postmaster",
    reports: "Spam rate and domain reputation",
  },
  snds: {
    source: "Microsoft SNDS",
    reports: "IP reputation and complaint rate",
  },
  jmrp: {
    source: "Microsoft JMRP",
    reports: "Junk reports from Outlook users",
  },
  yahoo: {
    source: "Yahoo Sender Hub",
    reports: "Complaint rate",
  },
}

function num(value: unknown): number {
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

function text(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (value == null) {
    return ""
  }
  return String(value)
}

function dayKey(value: unknown): string {
  return text(value).slice(0, 10)
}

export function shortDayLabel(iso: string): string {
  const [, month, day] = iso.split("-")
  const monthIndex = Number(month) - 1
  const label = MONTHS[monthIndex]
  if (!label || !day) {
    return iso
  }
  return `${label} ${Number(day)}`
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

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function humanizeToken(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return "Unknown"
  }
  const words = trimmed.replaceAll("_", " ").replaceAll("-", " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function rate(part: number, whole: number): number | null {
  if (whole <= 0) {
    return null
  }
  return part / whole
}

function matchesDomain(domain: string, selected: string | null): boolean {
  return !selected || domain === selected
}

export function normalizeSendingRows(
  data: Record<string, unknown>[]
): SendingRow[] {
  return data.map((row) => ({
    day: dayKey(row.day),
    sending_domain: text(row.sending_domain),
    provider: text(row.provider),
    email_type: text(row.email_type),
    sent: num(row.sent),
    delivered: num(row.delivered),
    bounce_hard: num(row.bounce_hard),
    bounce_soft: num(row.bounce_soft),
    complaint: num(row.complaint),
  }))
}

export function normalizeEngagementRows(
  data: Record<string, unknown>[]
): EngagementRow[] {
  return data.map((row) => ({
    day: dayKey(row.day),
    sending_domain: text(row.sending_domain),
    provider: text(row.provider),
    email_type: text(row.email_type),
    opens: num(row.opens),
    unique_opens: num(row.unique_opens),
    clicks: num(row.clicks),
    unique_clicks: num(row.unique_clicks),
    unsubscribes: num(row.unsubscribes),
  }))
}

export function normalizeLinkRows(
  data: Record<string, unknown>[]
): LinkClickRow[] {
  return data.map((row) => ({
    link_url: text(row.link_url),
    clicks: num(row.clicks),
  }))
}

export function normalizeEnvironmentRows(
  data: Record<string, unknown>[]
): EnvironmentRow[] {
  return data.map((row) => ({
    client: text(row.client),
    device_type: text(row.device_type),
    os: text(row.os),
    country: text(row.country),
    region: text(row.region),
    opens: num(row.opens),
    clicks: num(row.clicks),
    unsubscribes: num(row.unsubscribes),
  }))
}

export function normalizeFrequencyRows(
  data: Record<string, unknown>[]
): OpenFrequencyRow[] {
  return data.map((row) => ({
    bucket: text(row.bucket),
    recipients: num(row.recipients),
  }))
}

export function normalizeProviderRows(
  data: Record<string, unknown>[]
): ProviderMetricRow[] {
  return data.map((row) => ({
    provider: text(row.provider),
    target: text(row.target),
    metric: text(row.metric),
    day: dayKey(row.day),
    value: num(row.value),
  }))
}

export function sendingDomainOptions(rows: SendingRow[]): string[] {
  return [
    ...new Set(rows.map((row) => row.sending_domain).filter(Boolean)),
  ].sort()
}

function volumeRow(key: string, label: string): VolumeRow {
  return {
    key,
    label,
    sent: 0,
    delivered: 0,
    bounced: 0,
    opens: 0,
    clicks: 0,
    unsubscribes: 0,
    bounceRate: null,
  }
}

function finishVolume(row: VolumeRow): VolumeRow {
  return {
    ...row,
    bounceRate: rate(row.bounced, row.sent),
  }
}

export function buildSendView(input: {
  sending: SendingRow[]
  engagement: EngagementRow[]
  domain: string | null
}): SendView {
  const sending = input.sending.filter((row) =>
    matchesDomain(row.sending_domain, input.domain)
  )
  const engagement = input.engagement.filter((row) =>
    matchesDomain(row.sending_domain, input.domain)
  )

  let sent = 0
  let delivered = 0
  let bounced = 0
  let complaints = 0
  let unsubscribes = 0
  const byDomain = new Map<string, VolumeRow>()
  const byDay = new Map<string, VolumeRow>()

  for (const row of sending) {
    const bounce = row.bounce_hard + row.bounce_soft
    sent += row.sent
    delivered += row.delivered
    bounced += bounce
    complaints += row.complaint
    const domain =
      byDomain.get(row.sending_domain) ??
      volumeRow(row.sending_domain, row.sending_domain || "Unknown")
    domain.sent += row.sent
    domain.delivered += row.delivered
    domain.bounced += bounce
    byDomain.set(row.sending_domain, domain)
    const day = byDay.get(row.day) ?? volumeRow(row.day, shortDayLabel(row.day))
    day.sent += row.sent
    day.delivered += row.delivered
    day.bounced += bounce
    byDay.set(row.day, day)
  }

  for (const row of engagement) {
    unsubscribes += row.unsubscribes
    const domain =
      byDomain.get(row.sending_domain) ??
      volumeRow(row.sending_domain, row.sending_domain || "Unknown")
    domain.opens += row.opens
    domain.clicks += row.clicks
    domain.unsubscribes += row.unsubscribes
    byDomain.set(row.sending_domain, domain)
    const day = byDay.get(row.day) ?? volumeRow(row.day, shortDayLabel(row.day))
    day.opens += row.opens
    day.clicks += row.clicks
    day.unsubscribes += row.unsubscribes
    byDay.set(row.day, day)
  }

  return {
    kpis: {
      sent,
      deliveredRate: rate(delivered, sent),
      bouncedRate: rate(bounced, sent),
      complaints,
      unsubscribes,
    },
    daily: [...byDay.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((row) => ({
        day: row.key,
        label: row.label,
        delivered: row.delivered,
        bounced: row.bounced,
      })),
    domains: [...byDomain.values()]
      .map(finishVolume)
      .sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label)),
    days: [...byDay.values()]
      .map(finishVolume)
      .sort((a, b) => a.key.localeCompare(b.key)),
  }
}

export function buildEngagementView(input: {
  sending: SendingRow[]
  engagement: EngagementRow[]
  links: LinkClickRow[]
  environment: EnvironmentRow[]
  frequency: OpenFrequencyRow[]
  domain: string | null
}): EngagementView {
  const sending = input.sending.filter((row) =>
    matchesDomain(row.sending_domain, input.domain)
  )
  const engagement = input.engagement.filter((row) =>
    matchesDomain(row.sending_domain, input.domain)
  )
  const counts = new Map<string, number>(
    FREQUENCY_BUCKETS.map((bucket) => [bucket.bucket, 0])
  )
  for (const row of input.frequency) {
    const bucket = row.bucket === "6" || row.bucket === "7" ? "8+" : row.bucket
    if (!counts.has(bucket)) {
      continue
    }
    counts.set(bucket, (counts.get(bucket) ?? 0) + row.recipients)
  }

  const clients = new Map<string, number>()
  const devices = new Map<string, { opens: number; clicks: number }>()
  const locations = new Map<string, { clicks: number; unsubscribes: number }>()
  for (const row of input.environment) {
    const client = clientGroupLabel(row.client)
    clients.set(client, (clients.get(client) ?? 0) + row.opens)
    const device =
      [row.device_type.trim(), row.os.trim()].filter(Boolean).join(" · ") ||
      "Unknown"
    const deviceBucket = devices.get(device) ?? { opens: 0, clicks: 0 }
    deviceBucket.opens += row.opens
    deviceBucket.clicks += row.clicks
    devices.set(device, deviceBucket)
    const location = row.region.trim() || row.country.trim() || "Unknown"
    const locationBucket = locations.get(location) ?? {
      clicks: 0,
      unsubscribes: 0,
    }
    locationBucket.clicks += row.clicks
    locationBucket.unsubscribes += row.unsubscribes
    locations.set(location, locationBucket)
  }
  const clientTotal = [...clients.values()].reduce(
    (sum, value) => sum + value,
    0
  )

  const deliveredByType = new Map<string, number>()
  for (const row of sending) {
    const key = row.email_type || "unknown"
    deliveredByType.set(key, (deliveredByType.get(key) ?? 0) + row.delivered)
  }
  const unsubByType = new Map<string, number>()
  for (const row of engagement) {
    const key = row.email_type || "unknown"
    unsubByType.set(key, (unsubByType.get(key) ?? 0) + row.unsubscribes)
  }
  const typeKeys = new Set([...deliveredByType.keys(), ...unsubByType.keys()])

  return {
    frequency: FREQUENCY_BUCKETS.map((bucket) => ({
      bucket: bucket.bucket,
      label: bucket.label,
      recipients: counts.get(bucket.bucket) ?? 0,
    })),
    clients: [...clients.entries()]
      .map(([label, opens]) => ({
        label,
        opens,
        share: clientTotal > 0 ? opens / clientTotal : 0,
      }))
      .sort((a, b) => b.opens - a.opens)
      .slice(0, 8),
    links: [...input.links]
      .filter((row) => row.link_url.trim() !== "")
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8)
      .map((row) => ({ url: row.link_url, clicks: row.clicks })),
    unsubscribes: [...typeKeys]
      .map((key) => {
        const delivered = deliveredByType.get(key) ?? 0
        const unsubscribed = unsubByType.get(key) ?? 0
        return {
          label: humanizeToken(key),
          delivered,
          unsubscribed,
          rate: rate(unsubscribed, delivered),
        }
      })
      .filter((row) => row.delivered > 0 || row.unsubscribed > 0)
      .sort(
        (a, b) =>
          b.unsubscribed - a.unsubscribed || a.label.localeCompare(b.label)
      ),
    devices: [...devices.entries()]
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.opens - a.opens)
      .slice(0, 8),
    locations: [...locations.entries()]
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8),
  }
}

function isIpTarget(target: string): boolean {
  return target.includes("/") || /^\d+\.\d+\.\d+\.\d+$/.test(target)
}

function reputationLabel(value: number | null): {
  label: string
  tone: ProviderPostmasterRow["reputationTone"]
} {
  if (value == null) {
    return { label: "—", tone: "neutral" }
  }
  const rounded = Math.round(value)
  const label = REPUTATION_LABELS[rounded] ?? value.toFixed(2)
  if (rounded >= 4) {
    return { label, tone: "ok" }
  }
  if (rounded <= 1) {
    return { label, tone: "err" }
  }
  if (rounded === 2) {
    return { label, tone: "warn" }
  }
  return { label, tone: "neutral" }
}

function latestMetric(
  rows: ProviderMetricRow[],
  provider: string,
  target: string,
  metric: string
): ProviderMetricRow | null {
  let latest: ProviderMetricRow | null = null
  for (const row of rows) {
    if (
      row.provider !== provider ||
      row.target !== target ||
      row.metric !== metric
    ) {
      continue
    }
    if (!latest || row.day > latest.day) {
      latest = row
    }
  }
  return latest
}

function sourceSummary(rows: ProviderMetricRow[]): string {
  const spam = rows
    .filter((row) => row.metric === "spam_rate")
    .sort((a, b) => a.day.localeCompare(b.day))
  if (spam.length >= 2) {
    const first = spam[0]!
    const last = spam[spam.length - 1]!
    const delta = (last.value - first.value) * 100
    if (Math.abs(delta) < 0.05) {
      return "Flat"
    }
    const direction = delta > 0 ? "Up" : "Down"
    return `${direction} ${Math.abs(delta).toFixed(1)} pts`
  }
  const junk = rows.filter((row) => row.metric === "junk_reports")
  if (junk.length > 0) {
    const total = junk.reduce((sum, row) => sum + row.value, 0)
    return `${Math.round(total)} reports`
  }
  const complaint = rows
    .filter((row) => row.metric === "complaint_rate")
    .sort((a, b) => a.day.localeCompare(b.day))
  const latestComplaint = complaint[complaint.length - 1]
  if (latestComplaint) {
    return `${(latestComplaint.value * 100).toFixed(2)}%`
  }
  if (rows.length === 0) {
    return "No reports"
  }
  return `${rows.length} days reported`
}

export function buildProviderView(
  rows: ProviderMetricRow[],
  selectedDomain: string | null
): ProviderView {
  const postmaster = rows.filter((row) => row.provider === "google_postmaster")
  const domains = [
    ...new Set(
      postmaster
        .filter(
          (row) =>
            !isIpTarget(row.target) &&
            (row.metric === "spam_rate" || row.metric === "domain_reputation")
        )
        .map((row) => row.target)
        .filter(Boolean)
    ),
  ].sort()
  const selected =
    selectedDomain && domains.includes(selectedDomain)
      ? selectedDomain
      : (domains[0] ?? null)

  const spamSeries = postmaster
    .filter((row) => row.metric === "spam_rate" && row.target === selected)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => ({
      day: row.day,
      label: shortDayLabel(row.day),
      rate: row.value,
    }))

  const table = domains.map((domain) => {
    const reputation = latestMetric(
      postmaster,
      "google_postmaster",
      domain,
      "domain_reputation"
    )
    const spam = latestMetric(
      postmaster,
      "google_postmaster",
      domain,
      "spam_rate"
    )
    const pulled = [reputation?.day, spam?.day]
      .filter((day): day is string => Boolean(day))
      .sort()
      .at(-1)
    const reputationView = reputationLabel(reputation ? reputation.value : null)
    return {
      domain,
      reputation: reputationView.label,
      reputationTone: reputationView.tone,
      spamRate: spam ? spam.value : null,
      pulled: pulled ? shortDayLabel(pulled) : "—",
    }
  })

  const providers = ["google_postmaster", "snds", "jmrp", "yahoo"]
  const sources = providers.map((provider) => {
    const copy = SOURCE_COPY[provider] ?? {
      source: provider,
      reports: "Provider metric",
    }
    const matched = rows.filter((row) => row.provider === provider)
    return {
      source: copy.source,
      reports: copy.reports,
      summary: sourceSummary(matched),
      healthy: matched.length > 0,
    }
  })

  return {
    domains,
    selectedDomain: selected,
    spamSeries,
    postmaster: table,
    sources,
  }
}

export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n")
}
