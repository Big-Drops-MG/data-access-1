import { sql } from "drizzle-orm"
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { offer } from "./offer.js"
import { recipient } from "./recipient.js"
import { suppressionSyncRun } from "./suppression-sync-run.js"
import { user } from "./user.js"

export const suppressionScope = pgEnum("suppression_scope", [
  "global",
  "offer",
  "list_unsub",
])

export const suppressionSource = pgEnum("suppression_source", [
  "optizmo",
  "list_unsub",
  "feedback_review",
  "manual",
  "hard_bounce",
])

export const suppressionEntry = pgTable(
  "suppression_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailHash: text("email_hash").notNull(),
    recipientId: uuid("recipient_id").references(() => recipient.id, {
      onDelete: "set null",
    }),
    scope: suppressionScope("scope").notNull(),
    offerId: uuid("offer_id").references(() => offer.id, {
      onDelete: "cascade",
    }),
    source: suppressionSource("source").notNull(),
    reason: text("reason"),
    addedBy: uuid("added_by").references(() => user.id, {
      onDelete: "set null",
    }),
    syncRunId: uuid("sync_run_id").references(() => suppressionSyncRun.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    removedAt: timestamp("removed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("suppression_entry_offer_active_unique")
      .on(table.emailHash, table.scope, table.offerId)
      .where(sql`${table.removedAt} IS NULL AND ${table.offerId} IS NOT NULL`),
    uniqueIndex("suppression_entry_global_active_unique")
      .on(table.emailHash, table.scope)
      .where(sql`${table.removedAt} IS NULL AND ${table.offerId} IS NULL`),
    index("suppression_entry_email_hash_removed_at_idx").on(
      table.emailHash,
      table.removedAt
    ),
    index("suppression_entry_offer_scope_removed_at_idx").on(
      table.offerId,
      table.scope,
      table.removedAt
    ),
    check(
      "suppression_entry_scope_offer_check",
      sql`(
        (${table.scope} = 'offer' AND ${table.offerId} IS NOT NULL)
        OR (${table.scope} <> 'offer' AND ${table.offerId} IS NULL)
      )`
    ),
  ]
)

export type SuppressionEntry = typeof suppressionEntry.$inferSelect
export type NewSuppressionEntry = typeof suppressionEntry.$inferInsert
