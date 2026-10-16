import { desc, sql } from "drizzle-orm"
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { emailType } from "./email-type.js"
import { offer } from "./offer.js"
import { recipient } from "./recipient.js"
import { sender } from "./sender.js"
import { send } from "./send.js"
import { templateVersion } from "./template.js"

export const messageStatus = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "skipped",
  "failed",
])

export const messageSkipReason = pgEnum("message_skip_reason", [
  "recipient_bounced",
  "suppressed",
  "opted_out",
  "not_premium",
  "collision",
  "frequency_cap",
  "no_route",
])

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sendId: uuid("send_id").references(() => send.id, { onDelete: "restrict" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => recipient.id, { onDelete: "restrict" }),
    offerId: uuid("offer_id").references(() => offer.id, {
      onDelete: "restrict",
    }),
    emailType: emailType("email_type").notNull(),
    templateVersionId: uuid("template_version_id")
      .notNull()
      .references(() => templateVersion.id, { onDelete: "restrict" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => sender.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: messageStatus("status").notNull(),
    skipReason: messageSkipReason("skip_reason"),
    failureReason: text("failure_reason"),
    sesMessageId: text("ses_message_id"),
    queuedAt: timestamp("queued_at", { withTimezone: true, mode: "date" }),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("message_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("message_ses_message_id_unique")
      .on(table.sesMessageId)
      .where(sql`${table.sesMessageId} IS NOT NULL`),
    index("message_recipient_type_created_at_idx").on(
      table.recipientId,
      table.emailType,
      desc(table.createdAt)
    ),
    index("message_send_status_idx").on(table.sendId, table.status),
    check(
      "message_skip_reason_check",
      sql`(
        (${table.status} = 'skipped' AND ${table.skipReason} IS NOT NULL)
        OR (${table.status} <> 'skipped' AND ${table.skipReason} IS NULL)
      )`
    ),
  ]
)

export type Message = typeof message.$inferSelect
