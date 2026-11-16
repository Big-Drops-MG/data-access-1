import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

export const offerStatus = pgEnum("offer_status", ["active", "inactive"])

export type OfferCreativeJson = {
  network_offer_creative_id: number
  name: string
  creative_type: string
  creative_status: string
  resource_url: string
}

export type OfferTrackingLinksJson = {
  tracking_url: string | null
  impression_tracking_url: string | null
  redirect_tracking_url: string | null
  urls: Array<{
    network_offer_url_id: number
    name: string
    preview_url: string
  }>
}

export const offer = pgTable(
  "offer",
  {
    id: uuidv7PrimaryKey(),
    name: text("name").notNull(),
    externalRef: text("external_ref").notNull(),
    everflowOfferId: integer("everflow_offer_id"),
    status: offerStatus("status").notNull().default("active"),
    approvedSubjectLines: jsonb("approved_subject_lines")
      .$type<string[]>()
      .notNull()
      .default([]),
    approvedFromLines: jsonb("approved_from_lines")
      .$type<string[]>()
      .notNull()
      .default([]),
    trackingLinks: jsonb("tracking_links")
      .$type<OfferTrackingLinksJson | null>()
      .default(null),
    creatives: jsonb("creatives")
      .$type<OfferCreativeJson[]>()
      .notNull()
      .default([]),
    unsubscribeUrl: text("unsubscribe_url"),
    suppressionFileUrl: text("suppression_file_url"),
    optizmoMailerAccessKeyEncrypted: text(
      "optizmo_mailer_access_key_encrypted"
    ),
    hasOptizmoMailerAccessKey: boolean("has_optizmo_mailer_access_key")
      .notNull()
      .default(false),
    lastSyncedAt: timestamp("last_synced_at", {
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
    uniqueIndex("offer_external_ref_unique").on(table.externalRef),
    uniqueIndex("offer_everflow_offer_id_unique").on(table.everflowOfferId),
    index("offer_status_idx").on(table.status),
  ]
)

export type Offer = typeof offer.$inferSelect
export type NewOffer = typeof offer.$inferInsert
