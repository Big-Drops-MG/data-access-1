import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  EMAIL_EVENTS_ORDER_BY,
  EMAIL_EVENTS_TABLE,
  EMAIL_EVENT_TYPES,
  FORBIDDEN_EMAIL_EVENTS_COLUMNS,
  RAW_PAYLOAD_TTL_INTERVAL,
  RECIPIENT_ACTIVITY_MV,
  RECIPIENT_ACTIVITY_ORDER_BY,
  RECIPIENT_ACTIVITY_TABLE,
  clickHouseColumnNamesFromCreateTable,
  emailEventsQualifiedName,
  recipientActivityQualifiedName,
} from "./email-events-schema.js"
import {
  clickhouseMigrationsDir,
  listClickHouseMigrationFiles,
  splitSqlStatements,
} from "./migrations.js"

describe("email events ClickHouse migration", () => {
  const migrations = listClickHouseMigrationFiles(clickhouseMigrationsDir())
  const migration = migrations.find((file) => file.version === "0001")

  it("ships 0001_create_email_events.sql as the first migration", () => {
    expect(migration?.filename).toBe("0001_create_email_events.sql")
    expect(migrations[0]?.filename).toBe("0001_create_email_events.sql")
  })

  it("creates email_events, recipient_activity, and the MV", () => {
    expect(migration).toBeDefined()
    const sql = migration!.sql
    const statements = splitSqlStatements(sql)

    expect(statements).toHaveLength(3)
    expect(sql).toContain(
      `CREATE TABLE IF NOT EXISTS emailhub.${EMAIL_EVENTS_TABLE}`
    )
    expect(sql).toContain(
      `CREATE TABLE IF NOT EXISTS emailhub.${RECIPIENT_ACTIVITY_TABLE}`
    )
    expect(sql).toContain(
      `CREATE MATERIALIZED VIEW IF NOT EXISTS emailhub.${RECIPIENT_ACTIVITY_MV}`
    )
    expect(sql).toContain("SELECT * EXCEPT (raw_payload)")
    expect(sql).toContain(`FROM emailhub.${EMAIL_EVENTS_TABLE}`)
  })

  it("matches SD#6 ordering, partition, TTL, and ET day key", () => {
    const sql = migration!.sql
    expect(sql).toContain("ENGINE = MergeTree")
    expect(sql).toContain("PARTITION BY toYYYYMM(event_time)")
    expect(sql).toContain(`ORDER BY ${EMAIL_EVENTS_ORDER_BY}`)
    expect(sql).toContain(`ORDER BY ${RECIPIENT_ACTIVITY_ORDER_BY}`)
    expect(sql).toContain(
      `raw_payload         String CODEC(ZSTD(3)) TTL toDateTime(event_time) + ${RAW_PAYLOAD_TTL_INTERVAL}`
    )
    expect(sql).toContain("DateTime64(3, 'UTC')")
    expect(sql).toContain("America/New_York")
  })

  it("does not store email addresses or raw IP columns", () => {
    const columns = new Set(
      clickHouseColumnNamesFromCreateTable(migration!.sql).map((name) =>
        name.toLowerCase()
      )
    )
    for (const column of FORBIDDEN_EMAIL_EVENTS_COLUMNS) {
      expect(columns.has(column)).toBe(false)
    }
    expect(columns.has("email_type")).toBe(true)
    expect(columns.has("recipient_domain")).toBe(true)
    expect(columns.has("country")).toBe(true)
  })

  it("keeps recipient_activity free of raw_payload", () => {
    const sql = migration!.sql
    const activityBlock = sql.slice(
      sql.indexOf(
        `CREATE TABLE IF NOT EXISTS emailhub.${RECIPIENT_ACTIVITY_TABLE}`
      )
    )
    const activityOnly = activityBlock.slice(
      0,
      activityBlock.indexOf("CREATE MATERIALIZED VIEW")
    )
    expect(activityOnly).not.toContain("raw_payload")
  })

  it("exports stable qualified names and event type allow-list", () => {
    expect(emailEventsQualifiedName()).toBe("emailhub.email_events")
    expect(recipientActivityQualifiedName()).toBe("emailhub.recipient_activity")
    expect(EMAIL_EVENT_TYPES).toContain("unsubscribe")
    expect(EMAIL_EVENT_TYPES).toHaveLength(10)
  })

  it("keeps the migration file readable on disk for deploy packages", () => {
    const absolute = path.join(
      clickhouseMigrationsDir(),
      "0001_create_email_events.sql"
    )
    expect(fs.existsSync(absolute)).toBe(true)
    expect(fs.statSync(absolute).size).toBeGreaterThan(500)
  })
})
