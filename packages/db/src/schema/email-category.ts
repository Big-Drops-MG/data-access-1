import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./user.js"

export const emailCategoryKind = pgEnum("email_category_kind", [
  "transactional",
  "relationship",
])

export const emailCategory = pgTable(
  "email_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    kind: emailCategoryKind("kind").notNull(),
    defaultOptedIn: boolean("default_opted_in").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
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
    uniqueIndex("email_category_key_unique").on(table.key),
    index("email_category_created_by_idx").on(table.createdBy),
    index("email_category_is_active_idx").on(table.isActive),
  ]
)

export type EmailCategory = typeof emailCategory.$inferSelect
export type NewEmailCategory = typeof emailCategory.$inferInsert
