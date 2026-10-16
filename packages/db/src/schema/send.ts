import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { emailType } from "./email-type.js"
import { offer } from "./offer.js"
import { sender } from "./sender.js"
import { templateVersion } from "./template.js"
import { user } from "./user.js"

export const sendStatus = pgEnum("send_status", [
  "scheduled",
  "queued",
  "dispatching",
  "completed",
  "cancelled",
  "failed",
])

export const send = pgTable(
  "send",
  {
    id: uuidv7PrimaryKey(),
    emailType: emailType("email_type").notNull(),
    templateVersionId: uuid("template_version_id")
      .notNull()
      .references(() => templateVersion.id, { onDelete: "restrict" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => sender.id, { onDelete: "restrict" }),
    offerId: uuid("offer_id").references(() => offer.id, {
      onDelete: "restrict",
    }),
    scheduledFor: timestamp("scheduled_for", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: sendStatus("status").notNull(),
    dispatchStartedAt: timestamp("dispatch_started_at", {
      withTimezone: true,
      mode: "date",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
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
    index("send_status_scheduled_for_idx").on(table.status, table.scheduledFor),
    check("send_version_positive", sql`${table.version} > 0`),
  ]
)

export type Send = typeof send.$inferSelect
