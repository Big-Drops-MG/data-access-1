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

import { user } from "./user.js"

export const domainStatus = pgEnum("domain_status", [
  "pending",
  "verifying",
  "verified",
  "failed",
  "inactive",
])

export const domain = pgTable(
  "domain",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sesIdentityArn: text("ses_identity_arn"),
    status: domainStatus("status").notNull().default("pending"),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("domain_name_unique").on(sql`lower(${table.name})`),
    index("domain_status_idx").on(table.status),
    index("domain_created_by_idx").on(table.createdBy),
  ]
)

export type Domain = typeof domain.$inferSelect
export type NewDomain = typeof domain.$inferInsert
