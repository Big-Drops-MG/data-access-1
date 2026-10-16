import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { domain } from "./domain.js"

export const dnsRecordPurpose = pgEnum("dns_record_purpose", [
  "spf",
  "dkim",
  "dmarc",
  "mx",
])

export const dnsRecordStatus = pgEnum("dns_record_status", [
  "pending",
  "pass",
  "fail",
  "pending_propagation",
])

export const dnsRecord = pgTable(
  "dns_record",
  {
    id: uuidv7PrimaryKey(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domain.id, { onDelete: "cascade" }),
    purpose: dnsRecordPurpose("purpose").notNull(),
    name: text("name").notNull(),
    recordType: text("record_type").notNull(),
    expectedValue: text("expected_value").notNull(),
    lastSeenValue: text("last_seen_value"),
    status: dnsRecordStatus("status").notNull().default("pending"),
    lastCheckedAt: timestamp("last_checked_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dns_record_domain_purpose_name_unique").on(
      table.domainId,
      table.purpose,
      table.name
    ),
    index("dns_record_domain_id_status_idx").on(table.domainId, table.status),
  ]
)

export type DnsRecord = typeof dnsRecord.$inferSelect
export type NewDnsRecord = typeof dnsRecord.$inferInsert
