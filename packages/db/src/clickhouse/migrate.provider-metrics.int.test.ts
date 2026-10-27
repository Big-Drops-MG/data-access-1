import { createClient } from "@clickhouse/client"
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"

import { CLICKHOUSE_DATABASE } from "./env.js"
import { migrateClickHouse } from "./migrate.js"
import { clickhouseMigrationsDir } from "./migrations.js"
import {
  DATA_CLOUD_DATABASE,
  DATA_CLOUD_RECIPIENT_TIER_TABLE,
  DATA_CLOUD_RECIPIENT_TIER_VIEW,
  DATA_CLOUD_TIER_DAILY_TABLE,
  DATA_CLOUD_TIER_DAILY_VIEW,
  DATA_CLOUD_VIEWS,
  PROVIDER_METRICS_TABLE,
} from "./provider-metrics-schema.js"

const clickhouseUrl = process.env.CLICKHOUSE_URL?.trim()

describe.skipIf(!clickhouseUrl)(
  "T-056 provider_metrics and Data Cloud migration",
  () => {
    it("applies 0003 and sample rows query through views", async () => {
      const url = clickhouseUrl!
      await migrateClickHouse({
        url,
        migrationsDir: clickhouseMigrationsDir(),
      })

      const client = createClient({ url, database: CLICKHOUSE_DATABASE })
      try {
        const tables = await client.query({
          query: `
            SELECT name
            FROM system.tables
            WHERE database = {db:String}
              AND name = {name:String}
          `,
          query_params: {
            db: CLICKHOUSE_DATABASE,
            name: PROVIDER_METRICS_TABLE,
          },
          format: "JSONEachRow",
        })
        expect(
          (await tables.json<{ name: string }>()).map((r) => r.name)
        ).toEqual([PROVIDER_METRICS_TABLE])

        const views = await client.query({
          query: `
            SELECT name
            FROM system.tables
            WHERE database = {db:String}
              AND name IN ({names:Array(String)})
            ORDER BY name
          `,
          query_params: {
            db: DATA_CLOUD_DATABASE,
            names: [...DATA_CLOUD_VIEWS],
          },
          format: "JSONEachRow",
        })
        expect(
          (await views.json<{ name: string }>()).map((row) => row.name)
        ).toEqual([...DATA_CLOUD_VIEWS].slice().sort())

        const reportId = randomUUID()
        await client.insert({
          table: PROVIDER_METRICS_TABLE,
          values: [
            {
              day: "2026-10-27",
              provider: "google_postmaster",
              target: "example.com",
              metric: "spam_rate",
              value: 0.012,
              source_report_id: reportId,
              version: 1_730_000_000_000,
            },
          ],
          format: "JSONEachRow",
        })

        const metrics = await client.query({
          query: `
            SELECT provider, target, metric, day, value
            FROM ${PROVIDER_METRICS_TABLE} FINAL
            WHERE day = {day:Date} AND provider = {provider:String}
          `,
          query_params: {
            day: "2026-10-27",
            provider: "google_postmaster",
          },
          format: "JSONEachRow",
        })
        const metricRow = (
          await metrics.json<{
            provider: string
            target: string
            metric: string
            value: number
          }>()
        )[0]
        expect(metricRow?.provider).toBe("google_postmaster")
        expect(metricRow?.target).toBe("example.com")
        expect(metricRow?.metric).toBe("spam_rate")
        expect(Number(metricRow?.value)).toBeCloseTo(0.012)

        await client.insert({
          table: `${DATA_CLOUD_DATABASE}.${DATA_CLOUD_RECIPIENT_TIER_TABLE}`,
          values: [
            {
              external_user_id: "user-1",
              tier: "premium",
              tier_updated_at: "2026-10-27 12:00:00.000",
            },
          ],
          format: "JSONEachRow",
        })
        await client.insert({
          table: `${DATA_CLOUD_DATABASE}.${DATA_CLOUD_TIER_DAILY_TABLE}`,
          values: [
            {
              day: "2026-10-27",
              tier: "premium",
              users: 3,
            },
          ],
          format: "JSONEachRow",
        })

        const recipientTier = await client.query({
          query: `
            SELECT external_user_id, tier
            FROM ${DATA_CLOUD_DATABASE}.${DATA_CLOUD_RECIPIENT_TIER_VIEW}
            WHERE external_user_id = {id:String}
          `,
          query_params: { id: "user-1" },
          format: "JSONEachRow",
        })
        const recipientRow = (
          await recipientTier.json<{
            external_user_id: string
            tier: string
          }>()
        )[0]
        expect(recipientRow?.external_user_id).toBe("user-1")
        expect(recipientRow?.tier).toBe("premium")

        const tierDaily = await client.query({
          query: `
            SELECT day, tier, sum(users) AS users
            FROM ${DATA_CLOUD_DATABASE}.${DATA_CLOUD_TIER_DAILY_VIEW}
            WHERE day = {day:Date} AND tier = {tier:String}
            GROUP BY day, tier
          `,
          query_params: { day: "2026-10-27", tier: "premium" },
          format: "JSONEachRow",
        })
        const tierRow = (
          await tierDaily.json<{ day: string; tier: string; users: string }>()
        )[0]
        expect(tierRow?.tier).toBe("premium")
        expect(Number(tierRow?.users ?? 0)).toBeGreaterThanOrEqual(3)
      } finally {
        await client.close()
      }
    }, 90_000)
  }
)
