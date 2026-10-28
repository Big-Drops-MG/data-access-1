import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { citext, uuidv7PrimaryKey } from "./columns.js"

export const userRole = pgEnum("user_role", ["admin", "operator", "viewer"])

export const userStatus = pgEnum("user_status", ["active", "deactivated"])

export const user = pgTable(
  "user",
  {
    id: uuidv7PrimaryKey(),
    email: citext("email").notNull(),
    name: text("name").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull(),
    /** Display job title from /onboarding (distinct from permission `role`). */
    jobTitle: text("job_title"),
    status: userStatus("status").notNull(),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)]
)

export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
