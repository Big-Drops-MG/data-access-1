import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { user } from "./user.js"

export const unsubscribeCustomDomainStatus = pgEnum(
  "unsubscribe_custom_domain_status",
  ["unset", "pending", "verified", "failed"]
)

/** Singleton Hub settings for public unsubscribe branding and host. */
export const unsubscribeSettings = pgTable(
  "unsubscribe_settings",
  {
    id: uuidv7PrimaryKey(),
    logoUrl: text("logo_url"),
    customDomain: text("custom_domain"),
    customDomainStatus: unsubscribeCustomDomainStatus("custom_domain_status")
      .notNull()
      .default("unset"),
    verificationToken: text("verification_token"),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
    updatedBy: uuid("updated_by").references(() => user.id, {
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
    index("unsubscribe_settings_custom_domain_status_idx").on(
      table.customDomainStatus
    ),
  ]
)

export type UnsubscribeSettings = typeof unsubscribeSettings.$inferSelect
export type NewUnsubscribeSettings = typeof unsubscribeSettings.$inferInsert
