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

export const seedAccountStatus = pgEnum("seed_account_status", [
  "active",
  "inactive",
  "failed",
  "paused",
])

export const seedAccount = pgTable(
  "seed_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    address: text("address").notNull(),
    credentialRef: text("credential_ref").notNull(),
    status: seedAccountStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("seed_account_address_unique").on(sql`lower(${table.address})`),
    index("seed_account_provider_status_idx").on(table.provider, table.status),
  ]
)

export type SeedAccount = typeof seedAccount.$inferSelect
export type NewSeedAccount = typeof seedAccount.$inferInsert
