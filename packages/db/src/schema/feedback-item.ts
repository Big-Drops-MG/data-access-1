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

import { feedbackClassification } from "./feedback-classification.js"
import { message } from "./message.js"
import { recipient } from "./recipient.js"
import { user } from "./user.js"

export const feedbackSource = pgEnum("feedback_source", [
  "provider_fbl",
  "feedback_form",
  "mailbox_report",
])

export const feedbackStatus = pgEnum("feedback_status", [
  "pending",
  "in_review",
  "resolved",
])

export const feedbackDecision = pgEnum("feedback_decision", [
  "suppress",
  "dismiss",
])

export const feedbackItem = pgTable(
  "feedback_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id").references(() => recipient.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => message.id, {
      onDelete: "set null",
    }),
    source: feedbackSource("source").notNull(),
    provider: text("provider"),
    classificationId: uuid("classification_id").references(
      () => feedbackClassification.id,
      { onDelete: "set null" }
    ),
    status: feedbackStatus("status").notNull().default("pending"),
    reviewingBy: uuid("reviewing_by").references(() => user.id, {
      onDelete: "set null",
    }),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    decision: feedbackDecision("decision"),
    decidedBy: uuid("decided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    dedupeHash: text("dedupe_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("feedback_item_dedupe_hash_unique").on(table.dedupeHash),
    index("feedback_item_status_created_at_idx").on(
      table.status,
      table.createdAt
    ),
    index("feedback_item_reviewing_locked_idx").on(
      table.reviewingBy,
      table.lockedAt
    ),
    check(
      "feedback_item_decision_check",
      sql`(
        (${table.decision} IS NULL AND ${table.decidedBy} IS NULL AND ${table.decidedAt} IS NULL)
        OR (${table.decision} IS NOT NULL AND ${table.decidedBy} IS NOT NULL AND ${table.decidedAt} IS NOT NULL)
      )`
    ),
  ]
)

export type FeedbackItem = typeof feedbackItem.$inferSelect
export type NewFeedbackItem = typeof feedbackItem.$inferInsert
