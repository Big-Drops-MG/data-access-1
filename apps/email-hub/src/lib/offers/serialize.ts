import type { Offer } from "@workspace/db"

export type OfferJson = {
  id: string
  name: string
  external_ref: string
  status: Offer["status"]
}

export function serializeOffer(row: Offer): OfferJson {
  return {
    id: row.id,
    name: row.name,
    external_ref: row.externalRef,
    status: row.status,
  }
}
