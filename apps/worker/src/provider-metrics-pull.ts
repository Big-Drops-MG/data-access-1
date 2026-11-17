import { randomUUID } from "node:crypto"

import { and, eq, gte, lt, sql } from "drizzle-orm"

import { domain, feedbackItem, message, providerReport } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import {
  PROVIDER_METRICS_TABLE,
  clickhouseInsert,
} from "@workspace/db/clickhouse"
import { getContextLogger } from "@workspace/logger"

const POSTMASTER_TOKEN_URL = "https://oauth2.googleapis.com/token"
const POSTMASTER_API_BASE = "https://gmailpostmastertools.googleapis.com/v1"
const SNDS_DATA_URL_DEFAULT =
  "https://sendersupport.olc.protection.outlook.com/snds/data.aspx"

export type PostmasterCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export type ProviderMetricsPullEnv = {
  GOOGLE_POSTMASTER_CLIENT_ID?: string
  GOOGLE_POSTMASTER_CLIENT_SECRET?: string
  GOOGLE_POSTMASTER_REFRESH_TOKEN?: string
  /** Automated Data Access key from the SNDS portal. */
  SNDS_KEY?: string
  /** Full daily data export URL (overrides SNDS_KEY when set). */
  SNDS_DATA_URL?: string
}

export type ProviderMetricInsertRow = {
  day: string
  provider: string
  target: string
  metric: string
  value: number
  source_report_id: string
  version: number
}

export type ProviderMetricsPullResult = {
  google: { domains: number; rows: number; skipped: boolean }
  snds: { ips: number; rows: number; skipped: boolean }
  yahoo: { rows: number; skipped: boolean }
  jmrp: { rows: number; skipped: boolean }
  rows: number
}

export type MetricsFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>

/** Map Postmaster domainReputation / ipReputation enums to Float64. */
export function reputationToValue(
  raw: string | undefined | null
): number | null {
  if (!raw) {
    return null
  }
  switch (raw.trim().toUpperCase()) {
    case "HIGH":
      return 4
    case "MEDIUM":
      return 3
    case "LOW":
      return 2
    case "BAD":
      return 1
    default:
      return null
  }
}

/** Map SNDS filter result labels to a numeric scale (1 green … 3 red). */
export function sndsFilterResultToValue(
  raw: string | undefined | null
): number | null {
  if (!raw) {
    return null
  }
  const normalized = raw.trim().toUpperCase()
  if (
    normalized === "GREEN" ||
    normalized.includes("GREEN") ||
    normalized === "0"
  ) {
    return 1
  }
  if (normalized === "YELLOW" || normalized.includes("YELLOW")) {
    return 2
  }
  if (normalized === "RED" || normalized.includes("RED")) {
    return 3
  }
  const asNumber = Number(normalized)
  if (Number.isFinite(asNumber)) {
    return asNumber
  }
  return null
}

export function parseComplaintRate(
  raw: string | undefined | null
): number | null {
  if (!raw) {
    return null
  }
  const trimmed = raw.trim()
  if (trimmed === "" || trimmed === "-" || trimmed.toLowerCase() === "n/a") {
    return null
  }
  const ratio = trimmed.match(/^1\s*:\s*(\d+(?:\.\d+)?)$/i)
  if (ratio?.[1]) {
    const denom = Number(ratio[1])
    return denom > 0 ? 1 / denom : null
  }
  const percent = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/)
  if (percent?.[1]) {
    return Number(percent[1]) / 100
  }
  const direct = Number(trimmed.replace(/,/g, ""))
  return Number.isFinite(direct) ? direct : null
}

export function readPostmasterCredentials(
  env: ProviderMetricsPullEnv
): PostmasterCredentials | null {
  const clientId = env.GOOGLE_POSTMASTER_CLIENT_ID?.trim() ?? ""
  const clientSecret = env.GOOGLE_POSTMASTER_CLIENT_SECRET?.trim() ?? ""
  const refreshToken = env.GOOGLE_POSTMASTER_REFRESH_TOKEN?.trim() ?? ""
  if (clientId === "" || clientSecret === "" || refreshToken === "") {
    return null
  }
  return { clientId, clientSecret, refreshToken }
}

export function resolveSndsDataUrl(env: ProviderMetricsPullEnv): string | null {
  const full = env.SNDS_DATA_URL?.trim() ?? ""
  if (full !== "") {
    return full
  }
  const key = env.SNDS_KEY?.trim() ?? ""
  if (key === "") {
    return null
  }
  return `${SNDS_DATA_URL_DEFAULT}?key=${encodeURIComponent(key)}`
}

export function etDateDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86_400_000)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

export function toPostmasterDateId(etDate: string): string {
  return etDate.replaceAll("-", "")
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
        continue
      }
      if (ch === '"') {
        inQuotes = false
        continue
      }
      cell += ch
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ",") {
      row.push(cell)
      cell = ""
      continue
    }
    if (ch === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }
    if (ch === "\r") {
      continue
    }
    cell += ch
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

function headerIndex(headers: string[], ...names: string[]): number {
  const lowered = headers.map((h) => h.trim().toLowerCase())
  for (const name of names) {
    const idx = lowered.indexOf(name.toLowerCase())
    if (idx >= 0) {
      return idx
    }
  }
  return -1
}

/** Activity Period like "11/16/2026 …" → YYYY-MM-DD when parseable. */
export function dayFromActivityPeriod(
  raw: string | undefined,
  fallbackDay: string
): string {
  if (!raw) {
    return fallbackDay
  }
  const match = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) {
    return fallbackDay
  }
  const month = match[1]!.padStart(2, "0")
  const day = match[2]!.padStart(2, "0")
  const year = match[3]!
  return `${year}-${month}-${day}`
}

export function sndsCsvToMetricRows(input: {
  csvText: string
  fallbackDay: string
  sourceReportId: string
  version: number
}): ProviderMetricInsertRow[] {
  const table = parseCsv(input.csvText)
  if (table.length < 2) {
    return []
  }
  const headers = table[0] ?? []
  const ipIdx = headerIndex(headers, "IP Address", "IP")
  const periodIdx = headerIndex(headers, "Activity Period")
  const complaintIdx = headerIndex(headers, "Complaint Rate")
  const trapIdx = headerIndex(headers, "Trap Hits", "Trap Message Hits")
  const filterIdx = headerIndex(headers, "Filter Result")
  if (ipIdx < 0) {
    return []
  }

  const rows: ProviderMetricInsertRow[] = []
  for (const cells of table.slice(1)) {
    const ip = cells[ipIdx]?.trim() ?? ""
    if (ip === "") {
      continue
    }
    const day = dayFromActivityPeriod(cells[periodIdx], input.fallbackDay)
    const base = {
      day,
      provider: "snds",
      target: ip,
      source_report_id: input.sourceReportId,
      version: input.version,
    }
    const complaint = parseComplaintRate(cells[complaintIdx])
    if (complaint != null) {
      rows.push({ ...base, metric: "complaint_rate", value: complaint })
    }
    const traps = Number((cells[trapIdx] ?? "").replace(/,/g, ""))
    if (Number.isFinite(traps)) {
      rows.push({ ...base, metric: "trap_hits", value: traps })
    }
    const filter = sndsFilterResultToValue(cells[filterIdx])
    if (filter != null) {
      rows.push({ ...base, metric: "filter_result", value: filter })
    }
  }
  return rows
}

type TrafficStatsJson = {
  name?: string
  spamRatio?: number
  domainReputation?: string
  ipReputations?: Array<{
    reputation?: string
    ipCidrRange?: string
  }>
}

export function trafficStatsToMetricRows(input: {
  domainName: string
  day: string
  stats: TrafficStatsJson
  sourceReportId: string
  version: number
}): ProviderMetricInsertRow[] {
  const rows: ProviderMetricInsertRow[] = []
  const base = {
    day: input.day,
    provider: "google_postmaster",
    source_report_id: input.sourceReportId,
    version: input.version,
  }

  if (typeof input.stats.spamRatio === "number") {
    rows.push({
      ...base,
      target: input.domainName,
      metric: "spam_rate",
      value: input.stats.spamRatio,
    })
  }

  const domainRep = reputationToValue(input.stats.domainReputation)
  if (domainRep != null) {
    rows.push({
      ...base,
      target: input.domainName,
      metric: "domain_reputation",
      value: domainRep,
    })
  }

  const ipReps = input.stats.ipReputations ?? []
  let worstIp: number | null = null
  for (const entry of ipReps) {
    const value = reputationToValue(entry.reputation)
    if (value == null) {
      continue
    }
    if (worstIp == null || value < worstIp) {
      worstIp = value
    }
    const cidr = entry.ipCidrRange?.trim()
    if (cidr) {
      rows.push({
        ...base,
        target: cidr,
        metric: "ip_reputation",
        value,
      })
    }
  }
  if (worstIp != null) {
    rows.push({
      ...base,
      target: input.domainName,
      metric: "ip_reputation",
      value: worstIp,
    })
  }

  return rows
}

async function refreshAccessToken(
  credentials: PostmasterCredentials,
  fetchImpl: MetricsFetch
): Promise<string> {
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: "refresh_token",
  })
  const response = await fetchImpl(POSTMASTER_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!response.ok) {
    throw new Error(
      `Postmaster token refresh failed (${String(response.status)})`
    )
  }
  const json = (await response.json()) as { access_token?: string }
  const token = json.access_token?.trim() ?? ""
  if (token === "") {
    throw new Error("Postmaster token refresh returned no access_token")
  }
  return token
}

async function fetchTrafficStats(input: {
  accessToken: string
  domainName: string
  dateId: string
  fetchImpl: MetricsFetch
}): Promise<TrafficStatsJson | null> {
  const encodedDomain = encodeURIComponent(input.domainName)
  const url = `${POSTMASTER_API_BASE}/domains/${encodedDomain}/trafficStats/${input.dateId}`
  const response = await input.fetchImpl(url, {
    headers: { authorization: `Bearer ${input.accessToken}` },
  })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(
      `Postmaster trafficStats failed for ${input.domainName} (${String(response.status)})`
    )
  }
  return (await response.json()) as TrafficStatsJson
}

async function pullGooglePostmaster(input: {
  db: Database
  env: ProviderMetricsPullEnv
  fetchImpl: MetricsFetch
  day: string
  sourceReportId: string
  version: number
}): Promise<{
  domains: number
  rows: ProviderMetricInsertRow[]
  skipped: boolean
}> {
  const logger = getContextLogger()
  const credentials = readPostmasterCredentials(input.env)
  if (!credentials) {
    logger.info(
      { event: "provider_metrics_pull.google_skipped_no_credentials" },
      "Skipping Postmaster pull; credentials not configured"
    )
    return { domains: 0, rows: [], skipped: true }
  }

  const verified = await input.db
    .select({ name: domain.name })
    .from(domain)
    .where(eq(domain.status, "verified"))

  if (verified.length === 0) {
    logger.info(
      { event: "provider_metrics_pull.google_no_verified_domains" },
      "No verified domains for Postmaster pull"
    )
    return { domains: 0, rows: [], skipped: false }
  }

  const accessToken = await refreshAccessToken(credentials, input.fetchImpl)
  const dateId = toPostmasterDateId(input.day)
  const rows: ProviderMetricInsertRow[] = []
  for (const row of verified) {
    const stats = await fetchTrafficStats({
      accessToken,
      domainName: row.name,
      dateId,
      fetchImpl: input.fetchImpl,
    })
    if (!stats) {
      continue
    }
    rows.push(
      ...trafficStatsToMetricRows({
        domainName: row.name,
        day: input.day,
        stats,
        sourceReportId: input.sourceReportId,
        version: input.version,
      })
    )
  }
  return { domains: verified.length, rows, skipped: false }
}

async function pullSnds(input: {
  env: ProviderMetricsPullEnv
  fetchImpl: MetricsFetch
  day: string
  sourceReportId: string
  version: number
}): Promise<{
  ips: number
  rows: ProviderMetricInsertRow[]
  skipped: boolean
}> {
  const logger = getContextLogger()
  const url = resolveSndsDataUrl(input.env)
  if (!url) {
    logger.info(
      { event: "provider_metrics_pull.snds_skipped_no_credentials" },
      "Skipping SNDS pull; SNDS_KEY / SNDS_DATA_URL not configured"
    )
    return { ips: 0, rows: [], skipped: true }
  }

  const response = await input.fetchImpl(url)
  if (!response.ok) {
    throw new Error(`SNDS data fetch failed (${String(response.status)})`)
  }
  const csvText = await response.text()
  const rows = sndsCsvToMetricRows({
    csvText,
    fallbackDay: input.day,
    sourceReportId: input.sourceReportId,
    version: input.version,
  })
  const ips = new Set(rows.map((row) => row.target)).size
  return { ips, rows, skipped: false }
}

function etDayBoundsUtc(day: string): { start: Date; end: Date } {
  // Approximate ET midnight as UTC-5; good enough for daily complaint rates.
  const start = new Date(`${day}T05:00:00.000Z`)
  const end = new Date(start.getTime() + 86_400_000)
  return { start, end }
}

async function pullHubFblAggregates(input: {
  db: Database
  day: string
  sourceReportId: string
  version: number
}): Promise<{
  yahoo: ProviderMetricInsertRow[]
  jmrp: ProviderMetricInsertRow[]
}> {
  const { start, end } = etDayBoundsUtc(input.day)

  const [sentRow] = await input.db
    .select({ count: sql<number>`count(*)::int` })
    .from(message)
    .where(and(gte(message.createdAt, start), lt(message.createdAt, end)))

  const sent = Number(sentRow?.count ?? 0)

  const reportCounts = await input.db
    .select({
      provider: providerReport.provider,
      count: sql<number>`count(*)::int`,
    })
    .from(providerReport)
    .where(
      and(
        gte(providerReport.receivedAt, start),
        lt(providerReport.receivedAt, end)
      )
    )
    .groupBy(providerReport.provider)

  const feedbackCounts = await input.db
    .select({
      provider: feedbackItem.provider,
      count: sql<number>`count(*)::int`,
    })
    .from(feedbackItem)
    .where(
      and(
        eq(feedbackItem.source, "provider_fbl"),
        gte(feedbackItem.createdAt, start),
        lt(feedbackItem.createdAt, end)
      )
    )
    .groupBy(feedbackItem.provider)

  let yahooComplaints = 0
  let jmrpComplaints = 0
  for (const row of reportCounts) {
    if (row.provider === "yahoo") {
      yahooComplaints += Number(row.count)
    }
    if (row.provider === "jmrp") {
      jmrpComplaints += Number(row.count)
    }
  }
  for (const row of feedbackCounts) {
    const provider = (row.provider ?? "").toLowerCase()
    if (provider === "yahoo") {
      yahooComplaints += Number(row.count)
    }
    if (
      provider === "jmrp" ||
      provider === "microsoft" ||
      provider === "outlook"
    ) {
      jmrpComplaints += Number(row.count)
    }
  }

  const yahoo: ProviderMetricInsertRow[] = []
  const jmrp: ProviderMetricInsertRow[] = []

  if (yahooComplaints > 0) {
    yahoo.push({
      day: input.day,
      provider: "yahoo",
      target: "hub",
      metric: "complaint_rate",
      value: sent > 0 ? yahooComplaints / sent : yahooComplaints,
      source_report_id: input.sourceReportId,
      version: input.version,
    })
  }

  if (jmrpComplaints > 0) {
    jmrp.push({
      day: input.day,
      provider: "jmrp",
      target: "hub",
      metric: "junk_reports",
      value: jmrpComplaints,
      source_report_id: input.sourceReportId,
      version: input.version,
    })
  }

  return { yahoo, jmrp }
}

export async function processProviderMetricsPull(options: {
  db: Database
  env: ProviderMetricsPullEnv
  fetchImpl?: MetricsFetch
  now?: Date
  insertRows?: (rows: ProviderMetricInsertRow[]) => Promise<void>
}): Promise<ProviderMetricsPullResult> {
  const logger = getContextLogger()
  const fetchImpl = options.fetchImpl ?? fetch
  const day = etDateDaysAgo(2, options.now)
  const sourceReportId = randomUUID()
  const version = Date.now()

  const google = await pullGooglePostmaster({
    db: options.db,
    env: options.env,
    fetchImpl,
    day,
    sourceReportId,
    version,
  })

  const snds = await pullSnds({
    env: options.env,
    fetchImpl,
    day,
    sourceReportId,
    version,
  })

  const hub = await pullHubFblAggregates({
    db: options.db,
    day,
    sourceReportId,
    version,
  })

  const allRows = [...google.rows, ...snds.rows, ...hub.yahoo, ...hub.jmrp]

  const insert =
    options.insertRows ??
    ((rows) => clickhouseInsert(PROVIDER_METRICS_TABLE, rows))
  await insert(allRows)

  const result: ProviderMetricsPullResult = {
    google: {
      domains: google.domains,
      rows: google.rows.length,
      skipped: google.skipped,
    },
    snds: {
      ips: snds.ips,
      rows: snds.rows.length,
      skipped: snds.skipped,
    },
    yahoo: {
      rows: hub.yahoo.length,
      skipped: false,
    },
    jmrp: {
      rows: hub.jmrp.length,
      skipped: false,
    },
    rows: allRows.length,
  }

  logger.info(
    {
      event: "provider_metrics_pull.completed",
      day,
      ...result,
    },
    "Provider metrics pull completed"
  )

  return result
}
