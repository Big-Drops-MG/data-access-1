import { desc } from "drizzle-orm"
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

export const blocklistTargetType = pgEnum("blocklist_target_type", [
  "domain",
  "ip",
])

export const blocklistCheck = pgTable(
  "blocklist_check",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: blocklistTargetType("target_type").notNull(),
    target: text("target").notNull(),
    listName: text("list_name").notNull(),
    listed: boolean("listed"),
    checkedAt: timestamp("checked_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("blocklist_check_target_checked_at_idx").on(
      table.target,
      desc(table.checkedAt)
    ),
    index("blocklist_check_list_name_checked_at_idx").on(
      table.listName,
      desc(table.checkedAt)
    ),
    index("blocklist_check_lookup_history_idx").on(
      table.targetType,
      table.target,
      table.listName,
      desc(table.checkedAt)
    ),
  ]
)

export type BlocklistCheck = typeof blocklistCheck.$inferSelect
export type NewBlocklistCheck = typeof blocklistCheck.$inferInsert
