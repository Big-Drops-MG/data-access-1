import type { ClickHouseClient } from "@clickhouse/client"

import { getClickHouseClient } from "./client.js"
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

export type EmailEventRow = {
  event_id: string
  event_type: EmailEventType
  event_time: string
  ingested_at?: string
  message_id: string
  ses_message_id: string
  recipient_id: string
  send_id: string | null
  offer_id: string | null
  email_type: string
  template_version_id: string
  sender_id: string
  sending_domain: string
  recipient_domain: string
  provider: string
  bounce_type?: string
  bounce_subtype?: string
  smtp_status?: string
  smtp_diagnostic?: string
  delay_type?: string
  complaint_type?: string
  link_url?: string
  user_agent?: string
  client?: string
  device_type?: string
  os?: string
  country?: string
  region?: string
  is_machine?: number
  machine_reason?: string
  raw_payload?: string
}

export async function insertEmailEvents(
  rows: EmailEventRow[],
  client: ClickHouseClient = getClickHouseClient()
): Promise<void> {
  if (rows.length === 0) {
    return
  }

  await client.insert({
    table: EMAIL_EVENTS_TABLE,
    values: rows,
    format: "JSONEachRow",
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 1,
    },
  })
}
