import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { user } from "./user.js"

export const alertSeverity = pgEnum("alert_severity", [
  "info",
  "warning",
  "critical",
])

export const alertStatus = pgEnum("alert_status", ["open", "resolved"])

export const alert = pgTable(
  "alert",
  {
    id: uuidv7PrimaryKey(),
    type: text("type").notNull(),
    severity: alertSeverity("severity").notNull(),
    status: alertStatus("status").notNull().default("open"),
    payload: jsonb("payload"),
    dedupeKey: text("dedupe_key"),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastTriggeredAt: timestamp("last_triggered_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    acknowledgedBy: uuid("acknowledged_by").references(() => user.id, {
      onDelete: "set null",
    }),
    acknowledgedAt: timestamp("acknowledged_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("alert_status_severity_idx").on(table.status, table.severity),
    index("alert_type_status_idx").on(table.type, table.status),
    uniqueIndex("alert_dedupe_open_unique")
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} IS NOT NULL AND ${table.status} = 'open'`),
    check(
      "alert_resolved_at_check",
      sql`(${table.status} = 'resolved' AND ${table.resolvedAt} IS NOT NULL) OR (${table.status} <> 'resolved')`
    ),
  ]
)

export type Alert = typeof alert.$inferSelect
export type NewAlert = typeof alert.$inferInsert
