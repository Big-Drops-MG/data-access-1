import { sql } from "drizzle-orm"
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const userRole = pgEnum("user_role", ["admin", "operator", "viewer"])

export const userStatus = pgEnum("user_status", ["active", "deactivated"])

export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").notNull(),
    status: userStatus("status").notNull(),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("user_email_unique").on(sql`lower(${table.email})`)]
)

export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
