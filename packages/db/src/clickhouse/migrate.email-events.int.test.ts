import { createClient } from "@clickhouse/client"
import { describe, expect, it } from "vitest"

import {
  EMAIL_EVENTS_TABLE,
  RECIPIENT_ACTIVITY_MV,
  RECIPIENT_ACTIVITY_TABLE,
} from "./email-events-schema.js"
import { CLICKHOUSE_DATABASE, resolveClickHouseUrl } from "./env.js"
import { migrateClickHouse } from "./migrate.js"
import { clickhouseMigrationsDir } from "./migrations.js"

const clickhouseUrl = process.env.CLICKHOUSE_URL?.trim()

describe.skipIf(!clickhouseUrl)("T-051 email_events migration", () => {
  it("applies 0001 and creates tables + MV", async () => {
    const url = clickhouseUrl ?? resolveClickHouseUrl()
    const result = await migrateClickHouse({
      url,
      migrationsDir: clickhouseMigrationsDir(),
    })

    expect(
      result.applied.includes("0001_create_email_events.sql") ||
        result.skipped.includes("0001_create_email_events.sql")
    ).toBe(true)

    const client = createClient({ url, database: CLICKHOUSE_DATABASE })
    try {
      const tables = await client.query({
        query: `
          SELECT name
          FROM system.tables
          WHERE database = {db:String}
            AND name IN ({names:Array(String)})
          ORDER BY name
        `,
        query_params: {
          db: CLICKHOUSE_DATABASE,
          names: [
            EMAIL_EVENTS_TABLE,
            RECIPIENT_ACTIVITY_TABLE,
            RECIPIENT_ACTIVITY_MV,
          ],
        },
        format: "JSONEachRow",
      })
      const rows = await tables.json<{ name: string }>()
      expect(rows.map((row) => row.name).sort()).toEqual(
        [
          EMAIL_EVENTS_TABLE,
          RECIPIENT_ACTIVITY_MV,
          RECIPIENT_ACTIVITY_TABLE,
        ].sort()
      )

      const columns = await client.query({
        query: `
          SELECT name
          FROM system.columns
          WHERE database = {db:String}
            AND table = {table:String}
          ORDER BY name
        `,
        query_params: {
          db: CLICKHOUSE_DATABASE,
          table: EMAIL_EVENTS_TABLE,
        },
        format: "JSONEachRow",
      })
      const columnNames = (await columns.json<{ name: string }>()).map(
        (row) => row.name
      )
      expect(columnNames).toContain("raw_payload")
      expect(columnNames).toContain("recipient_id")
      expect(columnNames).not.toContain("email")
      expect(columnNames).not.toContain("ip_address")

      const activityColumns = await client.query({
        query: `
          SELECT name
          FROM system.columns
          WHERE database = {db:String}
            AND table = {table:String}
          ORDER BY name
        `,
        query_params: {
          db: CLICKHOUSE_DATABASE,
          table: RECIPIENT_ACTIVITY_TABLE,
        },
        format: "JSONEachRow",
      })
      const activityNames = (
        await activityColumns.json<{ name: string }>()
      ).map((row) => row.name)
      expect(activityNames).not.toContain("raw_payload")
      expect(activityNames).toContain("recipient_id")
    } finally {
      await client.close()
    }
  }, 60_000)
})
