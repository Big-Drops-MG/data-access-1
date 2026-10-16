import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { citext, uuidv7PrimaryKey } from "./columns.js"
import { domain } from "./domain.js"
import { user } from "./user.js"

export const senderStatus = pgEnum("sender_status", [
  "active",
  "inactive",
  "pending_verification",
])

export const sender = pgTable(
  "sender",
  {
    id: uuidv7PrimaryKey(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domain.id, { onDelete: "restrict" }),
    fromName: text("from_name").notNull(),
    fromEmail: citext("from_email").notNull(),
    replyTo: citext("reply_to"),
    status: senderStatus("status").notNull().default("pending_verification"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deactivatedAt: timestamp("deactivated_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("sender_from_email_unique").on(table.fromEmail),
    index("sender_domain_id_status_idx").on(table.domainId, table.status),
    index("sender_created_by_idx").on(table.createdBy),
  ]
)

export type Sender = typeof sender.$inferSelect
export type NewSender = typeof sender.$inferInsert
