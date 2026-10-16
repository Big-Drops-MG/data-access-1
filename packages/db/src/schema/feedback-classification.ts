import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { user } from "./user.js"

export const feedbackClassification = pgTable(
  "feedback_classification",
  {
    id: uuidv7PrimaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
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
    uniqueIndex("feedback_classification_key_unique").on(table.key),
    index("feedback_classification_active_idx").on(table.active),
  ]
)

export type FeedbackClassification = typeof feedbackClassification.$inferSelect
export type NewFeedbackClassification =
  typeof feedbackClassification.$inferInsert
