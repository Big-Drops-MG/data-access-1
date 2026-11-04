import { createClient } from "@clickhouse/client"
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"

import { EMAIL_EVENTS_TABLE } from "./email-events-schema.js"
import { CLICKHOUSE_DATABASE } from "./env.js"
import { migrateClickHouse } from "./migrate.js"
import { clickhouseMigrationsDir } from "./migrations.js"
import {
  DAILY_SENDING_STATS_TABLE,
  ENGAGEMENT_DAILY_TABLE,
  ENVIRONMENT_DAILY_TABLE,
  LINK_CLICKS_DAILY_TABLE,
  REPORT_MATERIALIZED_VIEWS,
  REPORT_TABLES,
} from "./report-tables-schema.js"

const clickhouseUrl = process.env.CLICKHOUSE_URL?.trim()

describe.skipIf(!clickhouseUrl)("T-052 report tables migration", () => {
  it("applies 0002 and sample events fill every report table", async () => {
    const url = clickhouseUrl!
    await migrateClickHouse({
      url,
      migrationsDir: clickhouseMigrationsDir(),
    })

    const client = createClient({ url, database: CLICKHOUSE_DATABASE })
    try {
      const objects = await client.query({
        query: `
          SELECT name
          FROM system.tables
          WHERE database = {db:String}
            AND name IN ({names:Array(String)})
          ORDER BY name
        `,
        query_params: {
          db: CLICKHOUSE_DATABASE,
          names: [...REPORT_TABLES, ...REPORT_MATERIALIZED_VIEWS],
        },
        format: "JSONEachRow",
      })
      const names = (await objects.json<{ name: string }>()).map(
        (row) => row.name
      )
      expect(names).toEqual(
        [...REPORT_TABLES, ...REPORT_MATERIALIZED_VIEWS].slice().sort()
      )

      const messageId = randomUUID()
      const recipientId = randomUUID()
      const templateVersionId = randomUUID()
      const senderId = randomUUID()
      const eventTime = "2026-10-27 15:30:00.000"

      await client.insert({
        table: EMAIL_EVENTS_TABLE,
        values: [
          {
            event_id: randomUUID(),
            event_type: "sent",
            event_time: eventTime,
            message_id: messageId,
            ses_message_id: "ses-sent-1",
            recipient_id: recipientId,
            send_id: null,
            offer_id: null,
            email_type: "promo",
            template_version_id: templateVersionId,
            sender_id: senderId,
            sending_domain: "example.com",
            recipient_domain: "gmail.com",
            provider: "gmail",
            bounce_type: "",
            bounce_subtype: "",
            smtp_status: "",
            smtp_diagnostic: "",
            delay_type: "",
            complaint_type: "",
            link_url: "",
            user_agent: "",
            client: "",
            device_type: "",
            os: "",
            country: "",
            region: "",
            is_machine: 0,
            machine_reason: "",
            raw_payload: "{}",
          },
          {
            event_id: randomUUID(),
            event_type: "delivered",
            event_time: eventTime,
            message_id: messageId,
            ses_message_id: "ses-delivered-1",
            recipient_id: recipientId,
            send_id: null,
            offer_id: null,
            email_type: "promo",
            template_version_id: templateVersionId,
            sender_id: senderId,
            sending_domain: "example.com",
            recipient_domain: "gmail.com",
            provider: "gmail",
            bounce_type: "",
            bounce_subtype: "",
            smtp_status: "",
            smtp_diagnostic: "",
            delay_type: "",
            complaint_type: "",
            link_url: "",
            user_agent: "",
            client: "",
            device_type: "",
            os: "",
            country: "",
            region: "",
            is_machine: 0,
            machine_reason: "",
            raw_payload: "{}",
          },
          {
            event_id: randomUUID(),
            event_type: "open",
            event_time: eventTime,
            message_id: messageId,
            ses_message_id: "ses-open-1",
            recipient_id: recipientId,
            send_id: null,
            offer_id: null,
            email_type: "promo",
            template_version_id: templateVersionId,
            sender_id: senderId,
            sending_domain: "example.com",
            recipient_domain: "gmail.com",
            provider: "gmail",
            bounce_type: "",
            bounce_subtype: "",
            smtp_status: "",
            smtp_diagnostic: "",
            delay_type: "",
            complaint_type: "",
            link_url: "",
            user_agent: "Mozilla/5.0",
            client: "apple_mail",
            device_type: "desktop",
            os: "macos",
            country: "US",
            region: "NY",
            is_machine: 0,
            machine_reason: "",
            raw_payload: "{}",
          },
          {
            event_id: randomUUID(),
            event_type: "click",
            event_time: eventTime,
            message_id: messageId,
            ses_message_id: "ses-click-1",
            recipient_id: recipientId,
            send_id: null,
            offer_id: null,
            email_type: "promo",
            template_version_id: templateVersionId,
            sender_id: senderId,
            sending_domain: "example.com",
            recipient_domain: "gmail.com",
            provider: "gmail",
            bounce_type: "",
            bounce_subtype: "",
            smtp_status: "",
            smtp_diagnostic: "",
            delay_type: "",
            complaint_type: "",
            link_url: "https://example.com/cta",
            user_agent: "Mozilla/5.0",
            client: "apple_mail",
            device_type: "desktop",
            os: "macos",
            country: "US",
            region: "NY",
            is_machine: 0,
            machine_reason: "",
            raw_payload: "{}",
          },
        ],
        format: "JSONEachRow",
      })

      const sending = await client.query({
        query: `
          SELECT sum(sent) AS sent, sum(delivered) AS delivered
          FROM ${DAILY_SENDING_STATS_TABLE} FINAL
          WHERE sending_domain = {domain:String}
        `,
        query_params: { domain: "example.com" },
        format: "JSONEachRow",
      })
      const sendingRow = (
        await sending.json<{ sent: string; delivered: string }>()
      )[0]
      expect(Number(sendingRow?.sent ?? 0)).toBeGreaterThanOrEqual(1)
      expect(Number(sendingRow?.delivered ?? 0)).toBeGreaterThanOrEqual(1)

      const engagement = await client.query({
        query: `
          SELECT sum(opens) AS opens, sum(clicks) AS clicks
          FROM ${ENGAGEMENT_DAILY_TABLE} FINAL
          WHERE sending_domain = {domain:String} AND is_machine = 0
        `,
        query_params: { domain: "example.com" },
        format: "JSONEachRow",
      })
      const engagementRow = (
        await engagement.json<{ opens: string; clicks: string }>()
      )[0]
      expect(Number(engagementRow?.opens ?? 0)).toBeGreaterThanOrEqual(1)
      expect(Number(engagementRow?.clicks ?? 0)).toBeGreaterThanOrEqual(1)

      const links = await client.query({
        query: `
          SELECT sum(clicks) AS clicks
          FROM ${LINK_CLICKS_DAILY_TABLE} FINAL
          WHERE link_url = {url:String}
        `,
        query_params: { url: "https://example.com/cta" },
        format: "JSONEachRow",
      })
      const linkRow = (await links.json<{ clicks: string }>())[0]
      expect(Number(linkRow?.clicks ?? 0)).toBeGreaterThanOrEqual(1)

      const environment = await client.query({
        query: `
          SELECT sum(opens) AS opens, sum(clicks) AS clicks
          FROM ${ENVIRONMENT_DAILY_TABLE} FINAL
          WHERE country = {country:String} AND is_machine = 0
        `,
        query_params: { country: "US" },
        format: "JSONEachRow",
      })
      const environmentRow = (
        await environment.json<{ opens: string; clicks: string }>()
      )[0]
      expect(Number(environmentRow?.opens ?? 0)).toBeGreaterThanOrEqual(1)
      expect(Number(environmentRow?.clicks ?? 0)).toBeGreaterThanOrEqual(1)
    } finally {
      await client.close()
    }
  }, 90_000)
})
