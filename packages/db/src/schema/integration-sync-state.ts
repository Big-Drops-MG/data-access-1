import { desc, sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

export const integrationSyncStatus = pgEnum("integration_sync_status", [
  "healthy",
  "degraded",
  "failed",
])

export const integrationSyncState = pgTable(
  "integration_sync_state",
  {
    key: text("key").primaryKey(),
    lastSuccessAt: timestamp("last_success_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastAttemptAt: timestamp("last_attempt_at", {
      withTimezone: true,
      mode: "date",
    }),
    status: integrationSyncStatus("status").notNull().default("healthy"),
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("integration_sync_state_status_last_attempt_idx").on(
      table.status,
      desc(table.lastAttemptAt)
    ),
    check(
      "integration_sync_state_consecutive_failures_nonneg",
      sql`${table.consecutiveFailures} >= 0`
    ),
  ]
)

export type IntegrationSyncState = typeof integrationSyncState.$inferSelect
export type NewIntegrationSyncState = typeof integrationSyncState.$inferInsert
