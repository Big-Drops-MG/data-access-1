import type {
  Offer,
  OfferCreativeJson,
  OfferTrackingLinksJson,
} from "@workspace/db"

export type OfferJson = {
  id: string
  name: string
  external_ref: string
  everflow_offer_id: number | null
  status: Offer["status"]
  approved_subject_lines: string[]
  approved_from_lines: string[]
  tracking_links: OfferTrackingLinksJson | null
  creatives: OfferCreativeJson[]
  unsubscribe_url: string | null
  suppression_file_url: string | null
  has_optizmo_mailer_access_key: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type OfferListItemJson = {
  id: string
  name: string
  external_ref: string
  everflow_offer_id: number | null
  status: Offer["status"]
  has_optizmo_mailer_access_key: boolean
  last_synced_at: string | null
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

export function serializeOffer(row: Offer): OfferJson {
  return {
    id: row.id,
    name: row.name,
    external_ref: row.externalRef,
    everflow_offer_id: row.everflowOfferId,
    status: row.status,
    approved_subject_lines: row.approvedSubjectLines ?? [],
    approved_from_lines: row.approvedFromLines ?? [],
    tracking_links: row.trackingLinks ?? null,
    creatives: row.creatives ?? [],
    unsubscribe_url: row.unsubscribeUrl,
    suppression_file_url: row.suppressionFileUrl,
    has_optizmo_mailer_access_key: row.hasOptizmoMailerAccessKey,
    last_synced_at: iso(row.lastSyncedAt),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function serializeOfferListItem(row: Offer): OfferListItemJson {
  return {
    id: row.id,
    name: row.name,
    external_ref: row.externalRef,
    everflow_offer_id: row.everflowOfferId,
    status: row.status,
    has_optizmo_mailer_access_key: row.hasOptizmoMailerAccessKey,
    last_synced_at: iso(row.lastSyncedAt),
  }
}
