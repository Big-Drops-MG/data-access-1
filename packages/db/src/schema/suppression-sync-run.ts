import { desc } from "drizzle-orm"
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { user } from "./user.js"

export const suppressionSyncTrigger = pgEnum("suppression_sync_trigger", [
  "scheduled",
  "manual",
])

export const suppressionSyncStatus = pgEnum("suppression_sync_status", [
  "running",
  "completed",
  "failed",
])

export const suppressionSyncRun = pgTable(
  "suppression_sync_run",
  {
    id: uuidv7PrimaryKey(),
    source: text("source").notNull(),
    trigger: suppressionSyncTrigger("trigger").notNull(),
    status: suppressionSyncStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    rowsAdded: integer("rows_added").notNull().default(0),
    rowsRemoved: integer("rows_removed").notNull().default(0),
    error: text("error"),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("suppression_sync_run_source_started_at_idx").on(
      table.source,
      desc(table.startedAt)
    ),
  ]
)

export type SuppressionSyncRun = typeof suppressionSyncRun.$inferSelect
export type NewSuppressionSyncRun = typeof suppressionSyncRun.$inferInsert
