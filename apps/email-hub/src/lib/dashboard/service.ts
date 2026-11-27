import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { Queue } from "bullmq"

import {
  alert,
  emailRoute,
  integrationSyncState,
  offer,
  send,
  sender,
  template,
  type EmailRoute,
  type IntegrationSyncState,
  type Send,
} from "@workspace/db"
import {
  clickhouseQuery,
  type ClickHouseQueryParams,
} from "@workspace/db/clickhouse"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { AppError, BULLMQ_PREFIX, formatEtDate } from "@workspace/shared"

import { serializeAlert, type AlertJson } from "@/lib/alerts/serialize"
import { ADMIN_QUEUE_NAMES } from "@/lib/queues/names"
import { serializeSend, type SendJson } from "@/lib/sends/serialize"

type Db = Database | DatabaseTransaction

export const DASHBOARD_OPEN_ALERTS_LIMIT = 10
export const DASHBOARD_SENDS_LIMIT = 5
export const DASHBOARD_EMAIL_ROUTES_LIMIT = 8

export type DashboardEmailRoute = {
  id: string
  email_type: EmailRoute["emailType"]
  offer_id: string | null
  offer_name: string | null
  template_name: string
  sender_email: string
  status: EmailRoute["status"]
}

export type DashboardKpis = {
  sent: number
  delivered: number
  bounced: number
  complaints: number
}

export type DashboardQueueCounts = {
  queue: string
  waiting: number
  active: number
  failed: number
  delayed: number
}

export type DashboardIntegration = {
  key: string
  status: IntegrationSyncState["status"]
  last_success_at: string | null
  last_attempt_at: string | null
  last_error: string | null
}

export type DashboardSummary = {
  day: string
  kpis: DashboardKpis
  queues: DashboardQueueCounts[]
  open_alert_count: number
  open_alerts: AlertJson[]
  recent_sends: SendJson[]
  upcoming_sends: SendJson[]
  email_routes: DashboardEmailRoute[]
  integrations: DashboardIntegration[]
}

export type DashboardDeps = {
  now?: Date
  db?: Database
  runClickHouse?: (
    query: string,
    query_params?: ClickHouseQueryParams
  ) => Promise<Record<string, unknown>[]>
  getQueueCounts?: () => Promise<DashboardQueueCounts[]>
  loadEmailRoutes?: (db: Db) => Promise<DashboardEmailRoute[]>
  loadIntegrations?: (db: Db) => Promise<DashboardIntegration[]>
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "bigint") {
    return Number(value)
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export async function loadTodayKpis(
  day: string,
  runQuery: (
    query: string,
    query_params?: ClickHouseQueryParams
  ) => Promise<Record<string, unknown>[]> = clickhouseQuery
): Promise<DashboardKpis> {
  const rows = await runQuery(
    `
SELECT
  coalesce(sum(sent), 0) AS sent,
  coalesce(sum(delivered), 0) AS delivered,
  coalesce(sum(bounce_hard) + sum(bounce_soft), 0) AS bounced,
  coalesce(sum(complaint), 0) AS complaints
FROM daily_sending_stats
WHERE day = {day:Date}
`.trim(),
    { day }
  )
  const row = rows[0] ?? {}
  return {
    sent: asNumber(row.sent),
    delivered: asNumber(row.delivered),
    bounced: asNumber(row.bounced),
    complaints: asNumber(row.complaints),
  }
}

export async function loadQueueCounts(): Promise<DashboardQueueCounts[]> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw AppError.unavailable([
      { path: "queue", message: "Queue redis unavailable" },
    ])
  }

  const queues = ADMIN_QUEUE_NAMES.map(
    (name) =>
      new Queue(name, {
        connection: {
          url: redisUrl,
          maxRetriesPerRequest: 1,
          connectTimeout: 2_000,
        },
        prefix: BULLMQ_PREFIX,
      })
  )

  try {
    const counts = await Promise.all(
      queues.map(async (queue) => {
        const jobCounts = await queue.getJobCounts(
          "waiting",
          "active",
          "failed",
          "delayed"
        )
        return {
          queue: queue.name,
          waiting: jobCounts.waiting ?? 0,
          active: jobCounts.active ?? 0,
          failed: jobCounts.failed ?? 0,
          delayed: jobCounts.delayed ?? 0,
        }
      })
    )
    return counts
  } finally {
    await Promise.all(queues.map((queue) => queue.close()))
  }
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

async function loadOpenAlertCount(db: Db): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(alert)
    .where(eq(alert.status, "open"))
  return asNumber(rows[0]?.total)
}

export async function loadDashboardIntegrations(
  db: Db
): Promise<DashboardIntegration[]> {
  const rows = await db
    .select()
    .from(integrationSyncState)
    .orderBy(
      desc(integrationSyncState.lastAttemptAt),
      asc(integrationSyncState.key)
    )
  return rows.map((row) => ({
    key: row.key,
    status: row.status,
    last_success_at: isoOrNull(row.lastSuccessAt),
    last_attempt_at: isoOrNull(row.lastAttemptAt),
    last_error: row.lastError,
  }))
}

async function loadOpenAlerts(
  db: Db,
  limit = DASHBOARD_OPEN_ALERTS_LIMIT
): Promise<AlertJson[]> {
  const rows = await db
    .select()
    .from(alert)
    .where(eq(alert.status, "open"))
    .orderBy(desc(alert.lastTriggeredAt), desc(alert.id))
    .limit(limit)
  return rows.map(serializeAlert)
}

async function loadUpcomingSends(
  db: Db,
  now: Date,
  limit = DASHBOARD_SENDS_LIMIT
): Promise<SendJson[]> {
  const rows = await db
    .select()
    .from(send)
    .where(
      and(
        inArray(send.status, ["scheduled", "queued", "dispatching"]),
        gte(send.scheduledFor, now)
      )
    )
    .orderBy(asc(send.scheduledFor), asc(send.id))
    .limit(limit)
  return rows.map((row) => serializeSend(row))
}

export async function loadDashboardEmailRoutes(
  db: Db,
  limit = DASHBOARD_EMAIL_ROUTES_LIMIT
): Promise<DashboardEmailRoute[]> {
  const rows = await db
    .select({
      id: emailRoute.id,
      emailType: emailRoute.emailType,
      offerId: emailRoute.offerId,
      offerName: offer.name,
      templateName: template.name,
      senderEmail: sender.fromEmail,
      status: emailRoute.status,
    })
    .from(emailRoute)
    .innerJoin(template, eq(template.id, emailRoute.templateId))
    .innerJoin(sender, eq(sender.id, emailRoute.senderId))
    .leftJoin(offer, eq(offer.id, emailRoute.offerId))
    .orderBy(
      sql`case when ${emailRoute.status} = 'active' then 0 else 1 end`,
      desc(emailRoute.updatedAt),
      desc(emailRoute.id)
    )
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    email_type: row.emailType,
    offer_id: row.offerId,
    offer_name: row.offerName,
    template_name: row.templateName,
    sender_email: row.senderEmail,
    status: row.status,
  }))
}

async function loadRecentSends(
  db: Db,
  limit = DASHBOARD_SENDS_LIMIT
): Promise<SendJson[]> {
  const rows = await db
    .select()
    .from(send)
    .where(inArray(send.status, ["completed", "cancelled", "failed"]))
    .orderBy(
      desc(sql`coalesce(${send.completedAt}, ${send.scheduledFor})`),
      desc(send.id)
    )
    .limit(limit)
  return rows.map((row: Send) => serializeSend(row))
}

export async function getDashboardSummary(
  deps: DashboardDeps = {}
): Promise<DashboardSummary> {
  const now = deps.now ?? new Date()
  const day = formatEtDate(now)
  const db = deps.db ?? getDb()
  const runClickHouse = deps.runClickHouse ?? clickhouseQuery
  const getQueueCounts = deps.getQueueCounts ?? loadQueueCounts
  const loadEmailRoutes = deps.loadEmailRoutes ?? loadDashboardEmailRoutes
  const loadIntegrations = deps.loadIntegrations ?? loadDashboardIntegrations

  const [
    kpis,
    queues,
    openAlerts,
    upcomingSends,
    recentSends,
    emailRoutes,
    integrations,
    openAlertCount,
  ] = await Promise.all([
    loadTodayKpis(day, runClickHouse),
    getQueueCounts(),
    loadOpenAlerts(db),
    loadUpcomingSends(db, now),
    loadRecentSends(db),
    loadEmailRoutes(db),
    loadIntegrations(db),
    loadOpenAlertCount(db),
  ])

  return {
    day,
    kpis,
    queues,
    open_alert_count: openAlertCount,
    open_alerts: openAlerts,
    recent_sends: recentSends,
    upcoming_sends: upcomingSends,
    email_routes: emailRoutes,
    integrations,
  }
}
