import { CLICKHOUSE_DATABASE } from "./env.js"

export const EMAIL_EVENTS_TABLE = "email_events" as const
export const RECIPIENT_ACTIVITY_TABLE = "recipient_activity" as const
export const RECIPIENT_ACTIVITY_MV = "recipient_activity_mv" as const

export const EMAIL_EVENT_TYPES = [
  "sent",
  "delivered",
  "bounce_hard",
  "bounce_soft",
  "complaint",
  "reject",
  "delivery_delay",
  "open",
  "click",
  "unsubscribe",
] as const

export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number]

export const EMAIL_EVENTS_ORDER_BY =
  "(sending_domain, event_type, toDate(event_time, 'America/New_York'), message_id)" as const

export const RECIPIENT_ACTIVITY_ORDER_BY = "(recipient_id, event_time)" as const

export const RAW_PAYLOAD_TTL_INTERVAL = "INTERVAL 180 DAY" as const

export const FORBIDDEN_EMAIL_EVENTS_COLUMNS = [
  "email",
  "recipient_email",
  "ip",
  "ip_address",
  "client_ip",
  "source_ip",
] as const

export function clickHouseColumnNamesFromCreateTable(sql: string): string[] {
  const names: string[] = []
  const tableBlocks = sql.matchAll(
    /CREATE TABLE IF NOT EXISTS [^\s(]+\s*\(([\s\S]*?)\)\s*ENGINE/gi
  )
  for (const block of tableBlocks) {
    const body = block[1] ?? ""
    for (const line of body.split("\n")) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+/.exec(line)
      if (match?.[1]) {
        names.push(match[1])
      }
    }
  }
  return names
}

export function emailEventsQualifiedName(
  database: string = CLICKHOUSE_DATABASE
): string {
  return `${database}.${EMAIL_EVENTS_TABLE}`
}

export function recipientActivityQualifiedName(
  database: string = CLICKHOUSE_DATABASE
): string {
  return `${database}.${RECIPIENT_ACTIVITY_TABLE}`
}
