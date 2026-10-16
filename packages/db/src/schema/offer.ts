import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

export const offerStatus = pgEnum("offer_status", ["active", "inactive"])

export const offer = pgTable(
  "offer",
  {
    id: uuidv7PrimaryKey(),
    name: text("name").notNull(),
    externalRef: text("external_ref").notNull(),
    status: offerStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("offer_external_ref_unique").on(table.externalRef),
    index("offer_status_idx").on(table.status),
  ]
)

export type Offer = typeof offer.$inferSelect
export type NewOffer = typeof offer.$inferInsert
