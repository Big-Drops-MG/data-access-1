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
  DATA_CLOUD_DATABASE,
  DATA_CLOUD_RECIPIENT_TIER_VIEW,
  DATA_CLOUD_TIER_DAILY_VIEW,
  DATA_CLOUD_TIERS,
  DATA_CLOUD_VIEWS,
  PROVIDER_METRICS_BY_PROVIDER,
  PROVIDER_METRICS_ORDER_BY,
  PROVIDER_METRICS_PROVIDERS,
  PROVIDER_METRICS_TABLE,
  dataCloudViewQualifiedName,
  providerMetricsQualifiedName,
} from "./provider-metrics-schema.js"

describe("ClickHouse provider_metrics and Data Cloud migration", () => {
  const migrations = listClickHouseMigrationFiles(clickhouseMigrationsDir())
  const migration = migrations.find((file) => file.version === "0003")

  it("ships 0003 after report tables", () => {
    expect(migrations.map((file) => file.version)).toEqual([
      "0001",
      "0002",
      "0003",
    ])
    expect(migration?.filename).toBe(
      "0003_create_provider_metrics_and_data_cloud.sql"
    )
  })

  it("creates provider_metrics with ReplacingMergeTree(version)", () => {
    const sql = migration!.sql
    const statements = splitSqlStatements(sql)
    expect(statements.length).toBeGreaterThanOrEqual(5)

    expect(sql).toContain(
      `CREATE TABLE IF NOT EXISTS emailhub.${PROVIDER_METRICS_TABLE}`
    )
    expect(sql).toContain("ENGINE = ReplacingMergeTree(version)")
    expect(sql).toContain(`ORDER BY ${PROVIDER_METRICS_ORDER_BY}`)
    expect(sql).toContain("PARTITION BY toYYYYMM(day)")
    expect(sql).toContain("source_report_id UUID")
  })

  it("creates data_cloud database and contract views", () => {
    const sql = migration!.sql
    expect(sql).toContain(
      `CREATE DATABASE IF NOT EXISTS ${DATA_CLOUD_DATABASE}`
    )
    expect(sql).toContain(
      `CREATE VIEW IF NOT EXISTS ${DATA_CLOUD_DATABASE}.${DATA_CLOUD_RECIPIENT_TIER_VIEW}`
    )
    expect(sql).toContain(
      `CREATE VIEW IF NOT EXISTS ${DATA_CLOUD_DATABASE}.${DATA_CLOUD_TIER_DAILY_VIEW}`
    )
    expect(sql).toContain("external_user_id")
    expect(sql).toContain("tier_updated_at")
    expect(sql).toContain("DateTime64(3, 'UTC')")
  })

  it("keeps provider_metrics free of PII columns", () => {
    const columns = new Set(
      clickHouseColumnNamesFromCreateTable(migration!.sql).map((name) =>
        name.toLowerCase()
      )
    )
    for (const column of FORBIDDEN_EMAIL_EVENTS_COLUMNS) {
      expect(columns.has(column)).toBe(false)
    }
  })

  it("keeps named objects and allowed metrics stable", () => {
    expect(PROVIDER_METRICS_TABLE).toBe("provider_metrics")
    expect(PROVIDER_METRICS_PROVIDERS).toEqual([
      "google_postmaster",
      "snds",
      "jmrp",
      "yahoo",
    ])
    expect(PROVIDER_METRICS_BY_PROVIDER.google_postmaster).toEqual([
      "spam_rate",
      "domain_reputation",
      "ip_reputation",
    ])
    expect(PROVIDER_METRICS_BY_PROVIDER.snds).toEqual([
      "complaint_rate",
      "trap_hits",
      "filter_result",
    ])
    expect(PROVIDER_METRICS_BY_PROVIDER.jmrp).toEqual(["junk_reports"])
    expect(PROVIDER_METRICS_BY_PROVIDER.yahoo).toEqual(["complaint_rate"])
    expect(DATA_CLOUD_VIEWS).toEqual([
      DATA_CLOUD_RECIPIENT_TIER_VIEW,
      DATA_CLOUD_TIER_DAILY_VIEW,
    ])
    expect(DATA_CLOUD_TIERS).toEqual(["standard", "premium"])
    expect(providerMetricsQualifiedName()).toBe("emailhub.provider_metrics")
    expect(dataCloudViewQualifiedName(DATA_CLOUD_TIER_DAILY_VIEW)).toBe(
      "data_cloud.v_tier_daily"
    )
    expect(
      fs.existsSync(
        path.join(
          clickhouseMigrationsDir(),
          "0003_create_provider_metrics_and_data_cloud.sql"
        )
      )
    ).toBe(true)
  })
})
