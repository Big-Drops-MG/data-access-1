import {
  boolean,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { emailCategory } from "./email-category.js"
import { recipient } from "./recipient.js"

export const recipientPreferenceSource = pgEnum("recipient_preference_source", [
  "unsubscribe_link",
  "preference_center",
  "admin",
  "system",
  "import",
])

export const recipientPreference = pgTable(
  "recipient_preference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => recipient.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => emailCategory.id, { onDelete: "cascade" }),
    optedOut: boolean("opted_out").notNull().default(false),
    source: recipientPreferenceSource("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recipient_preference_recipient_category_unique").on(
      table.recipientId,
      table.categoryId
    ),
    index("recipient_preference_category_id_opted_out_idx").on(
      table.categoryId,
      table.optedOut
    ),
    index("recipient_preference_recipient_id_idx").on(table.recipientId),
  ]
)

export type RecipientPreference = typeof recipientPreference.$inferSelect
export type NewRecipientPreference = typeof recipientPreference.$inferInsert
