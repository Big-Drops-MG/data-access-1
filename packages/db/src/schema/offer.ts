import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const offerStatus = pgEnum("offer_status", ["active", "inactive"])

export const offer = pgTable(
  "offer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
