import { desc } from "drizzle-orm"
import { index, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { message } from "./message.js"
import { seedAccount } from "./seed-account.js"

export const seedPlacement = pgEnum("seed_placement", [
  "inbox",
  "promotions",
  "spam",
  "missing",
])

export const seedPlacementSource = pgEnum("seed_placement_source", [
  "imap_direct",
  "seed_list_only",
  "webhook",
  "manual",
])

export const seedPlacementResult = pgTable(
  "seed_placement_result",
  {
    id: uuidv7PrimaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    seedAccountId: uuid("seed_account_id")
      .notNull()
      .references(() => seedAccount.id, { onDelete: "cascade" }),
    placement: seedPlacement("placement").notNull(),
    source: seedPlacementSource("source").notNull(),
    checkedAt: timestamp("checked_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("seed_placement_result_seed_account_checked_at_idx").on(
      table.seedAccountId,
      desc(table.checkedAt)
    ),
    index("seed_placement_result_message_checked_at_idx").on(
      table.messageId,
      desc(table.checkedAt)
    ),
  ]
)

export type SeedPlacementResult = typeof seedPlacementResult.$inferSelect
export type NewSeedPlacementResult = typeof seedPlacementResult.$inferInsert
