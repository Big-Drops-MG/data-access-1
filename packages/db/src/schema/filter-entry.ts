import { desc, sql } from "drizzle-orm"
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./user.js"

export const filterEntryCategory = pgEnum("filter_entry_category", [
  "provider_rule",
  "algorithm_update",
  "blocklist_policy",
  "authentication",
  "general",
])

export const filterEntry = pgTable(
  "filter_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceUrl: text("source_url"),
    category: filterEntryCategory("category").notNull(),
    linkedChange: text("linked_change"),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("filter_entry_created_at_idx").on(desc(table.createdAt)),
    index("filter_entry_category_created_at_idx").on(
      table.category,
      desc(table.createdAt)
    ),
    check(
      "filter_entry_source_url_check",
      sql`${table.sourceUrl} IS NULL OR ${table.sourceUrl} ~* '^https?://'`
    ),
  ]
)

export type FilterEntry = typeof filterEntry.$inferSelect
export type NewFilterEntry = typeof filterEntry.$inferInsert
