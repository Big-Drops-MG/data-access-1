import path from "node:path"
import fs from "node:fs"
import { describe, expect, it } from "vitest"

import {
  FORBIDDEN_EMAIL_EVENTS_COLUMNS,
  clickHouseColumnNamesFromCreateTable,
} from "./email-events-schema.js"
import {
  clickhouseMigrationsDir,
  listClickHouseMigrationFiles,
  splitSqlStatements,
} from "./migrations.js"
import {
  DAILY_SENDING_STATS_MV,
  DAILY_SENDING_STATS_TABLE,
  ENGAGEMENT_DAILY_MV,
  ENGAGEMENT_DAILY_TABLE,
  ENVIRONMENT_DAILY_MV,
  ENVIRONMENT_DAILY_TABLE,
  LINK_CLICKS_DAILY_MV,
  LINK_CLICKS_DAILY_TABLE,
  REPORT_DAY_EXPRESSION,
  REPORT_MATERIALIZED_VIEWS,
  REPORT_TABLES,
} from "./report-tables-schema.js"

describe("ClickHouse report tables migration", () => {
  const migrations = listClickHouseMigrationFiles(clickhouseMigrationsDir())
  const migration = migrations.find((file) => file.version === "0002")

  it("ships 0002 after email_events", () => {
    expect(migrations.map((file) => file.version)).toEqual(["0001", "0002"])
    expect(migration?.filename).toBe("0002_create_report_tables.sql")
  })

  it("creates four report tables and four MVs", () => {
    const sql = migration!.sql
    const statements = splitSqlStatements(sql)
    expect(statements).toHaveLength(8)

    for (const table of REPORT_TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS emailhub.${table}`)
    }
    for (const view of REPORT_MATERIALIZED_VIEWS) {
      expect(sql).toContain(
        `CREATE MATERIALIZED VIEW IF NOT EXISTS emailhub.${view}`
      )
    }
  })

  it("uses ET day keys and engines from SD#6", () => {
    const sql = migration!.sql
    expect(sql).toContain(REPORT_DAY_EXPRESSION)
    expect(sql).toContain("ENGINE = SummingMergeTree")
    expect(sql).toContain("ENGINE = AggregatingMergeTree")
    expect(sql).toContain("uniqStateIf(message_id, event_type = 'open')")
    expect(sql).toContain("uniqStateIf(message_id, event_type = 'click')")
    expect(sql).toContain(
      `ORDER BY (day, sending_domain, provider, email_type, is_machine)`
    )
    expect(sql).toContain(
      `ORDER BY (day, template_version_id, link_url, is_machine)`
    )
    expect(sql).toContain(
      `ORDER BY (day, client, device_type, os, country, region, is_machine)`
    )
  })

  it("wires each MV to email_events without PII columns", () => {
    const sql = migration!.sql
    expect(sql).toContain("FROM emailhub.email_events")
    expect(sql).toContain(`TO emailhub.${DAILY_SENDING_STATS_TABLE}`)
    expect(sql).toContain(`TO emailhub.${ENGAGEMENT_DAILY_TABLE}`)
    expect(sql).toContain(`TO emailhub.${LINK_CLICKS_DAILY_TABLE}`)
    expect(sql).toContain(`TO emailhub.${ENVIRONMENT_DAILY_TABLE}`)

    const columns = new Set(
      clickHouseColumnNamesFromCreateTable(sql).map((name) =>
        name.toLowerCase()
      )
    )
    for (const column of FORBIDDEN_EMAIL_EVENTS_COLUMNS) {
      expect(columns.has(column)).toBe(false)
    }
  })

  it("keeps named objects stable for ingest and reports", () => {
    expect(DAILY_SENDING_STATS_TABLE).toBe("daily_sending_stats")
    expect(DAILY_SENDING_STATS_MV).toBe("daily_sending_stats_mv")
    expect(ENGAGEMENT_DAILY_TABLE).toBe("engagement_daily")
    expect(ENGAGEMENT_DAILY_MV).toBe("engagement_daily_mv")
    expect(LINK_CLICKS_DAILY_TABLE).toBe("link_clicks_daily")
    expect(LINK_CLICKS_DAILY_MV).toBe("link_clicks_daily_mv")
    expect(ENVIRONMENT_DAILY_TABLE).toBe("environment_daily")
    expect(ENVIRONMENT_DAILY_MV).toBe("environment_daily_mv")
    expect(
      fs.existsSync(
        path.join(clickhouseMigrationsDir(), "0002_create_report_tables.sql")
      )
    ).toBe(true)
  })
})
