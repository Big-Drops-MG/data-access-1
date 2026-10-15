import { sql } from "drizzle-orm"
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { feedbackItem } from "./feedback-item.js"

export const providerReportProvider = pgEnum("provider_report_provider", [
  "postmaster",
  "snds",
  "jmrp",
  "yahoo",
])

export const providerReportStatus = pgEnum("provider_report_status", [
  "new",
  "parsed",
  "failed",
])

export const providerReport = pgTable(
  "provider_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: providerReportProvider("provider").notNull(),
    mailboxUid: text("mailbox_uid"),
    contentHash: text("content_hash").notNull(),
    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    parsed: jsonb("parsed"),
    rawContent: text("raw_content"),
    rawContentRef: text("raw_content_ref"),
    status: providerReportStatus("status").notNull().default("new"),
    parseError: text("parse_error"),
    parsedAt: timestamp("parsed_at", { withTimezone: true, mode: "date" }),
    feedbackItemId: uuid("feedback_item_id").references(() => feedbackItem.id, {
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
    uniqueIndex("provider_report_content_hash_unique").on(table.contentHash),
    uniqueIndex("provider_report_provider_mailbox_uid_unique")
      .on(table.provider, table.mailboxUid)
      .where(sql`${table.mailboxUid} IS NOT NULL`),
    index("provider_report_status_received_at_idx").on(
      table.status,
      table.receivedAt
    ),
    index("provider_report_feedback_item_id_idx").on(table.feedbackItemId),
  ]
)

export type ProviderReport = typeof providerReport.$inferSelect
export type NewProviderReport = typeof providerReport.$inferInsert
