import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { user } from "./user.js"

export const trustedDevice = pgTable(
  "trusted_device",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("trusted_device_token_hash_unique").on(table.tokenHash),
    index("trusted_device_user_id_idx").on(table.userId),
    index("trusted_device_expires_at_idx").on(table.expiresAt),
  ]
)

export type TrustedDevice = typeof trustedDevice.$inferSelect
