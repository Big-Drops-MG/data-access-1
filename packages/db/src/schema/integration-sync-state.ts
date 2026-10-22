import { desc } from "drizzle-orm"
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"

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
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("integration_sync_state_status_last_attempt_idx").on(
      table.status,
      desc(table.lastAttemptAt)
    ),
  ]
)

export type IntegrationSyncState = typeof integrationSyncState.$inferSelect
export type NewIntegrationSyncState = typeof integrationSyncState.$inferInsert
