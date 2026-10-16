import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const recipientTier = pgEnum("recipient_tier", ["standard", "premium"])

export const recipientStatus = pgEnum("recipient_status", ["active", "bounced"])

export const recipient = pgTable(
  "recipient",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
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
    uniqueIndex("recipient_email_unique").on(sql`lower(${table.email})`),
    uniqueIndex("recipient_email_hash_unique").on(table.emailHash),
    index("recipient_external_user_id_idx").on(table.externalUserId),
    index("recipient_tier_status_idx").on(table.tier, table.status),
  ]
)

export type Recipient = typeof recipient.$inferSelect
export type NewRecipient = typeof recipient.$inferInsert
