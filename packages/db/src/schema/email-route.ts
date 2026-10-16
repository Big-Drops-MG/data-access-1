import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { emailType } from "./email-type.js"
import { offer } from "./offer.js"
import { sender } from "./sender.js"
import { template } from "./template.js"
import { user } from "./user.js"

export const emailRouteStatus = pgEnum("email_route_status", [
  "active",
  "inactive",
])

export const emailRoute = pgTable(
  "email_route",
  {
    id: uuidv7PrimaryKey(),
    emailType: emailType("email_type").notNull(),
    offerId: uuid("offer_id").references(() => offer.id, {
      onDelete: "restrict",
    }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => template.id, { onDelete: "restrict" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => sender.id, { onDelete: "restrict" }),
    status: emailRouteStatus("status").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("email_route_active_offer_unique")
      .on(table.emailType, table.offerId)
      .where(sql`${table.status} = 'active' AND ${table.offerId} IS NOT NULL`),
    uniqueIndex("email_route_active_default_unique")
      .on(table.emailType)
      .where(sql`${table.status} = 'active' AND ${table.offerId} IS NULL`),
    index("email_route_email_type_status_idx").on(
      table.emailType,
      table.status
    ),
    check("email_route_version_positive", sql`${table.version} > 0`),
  ]
)

export type EmailRoute = typeof emailRoute.$inferSelect
