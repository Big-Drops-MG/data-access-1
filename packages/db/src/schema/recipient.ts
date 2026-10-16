import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { citext, uuidv7PrimaryKey } from "./columns.js"

export const recipientTier = pgEnum("recipient_tier", ["standard", "premium"])

export const recipientStatus = pgEnum("recipient_status", ["active", "bounced"])

export const recipient = pgTable(
  "recipient",
  {
    id: uuidv7PrimaryKey(),
    email: citext("email").notNull(),
    emailHash: text("email_hash").notNull(),
    externalUserId: text("external_user_id"),
    tier: recipientTier("tier").notNull().default("standard"),
    tierUpdatedAt: timestamp("tier_updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    status: recipientStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    lastEmailedAt: timestamp("last_emailed_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("recipient_email_unique").on(table.email),
    uniqueIndex("recipient_email_hash_unique").on(table.emailHash),
    index("recipient_external_user_id_idx").on(table.externalUserId),
    index("recipient_tier_status_idx").on(table.tier, table.status),
  ]
)

export type Recipient = typeof recipient.$inferSelect
export type NewRecipient = typeof recipient.$inferInsert
