export type OfferSearchable = {
  name: string
  external_ref: string
  everflow_offer_id: number | null
}

export function normalizeOfferQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ")
}

/** Match name, external_ref, or Everflow id (and #id / ef id forms). */
export function offerMatchesQuery(
  offer: OfferSearchable,
  rawQuery: string
): boolean {
  const query = normalizeOfferQuery(rawQuery)
  if (query === "") {
    return true
  }
  const name = offer.name.toLowerCase()
  const ref = offer.external_ref.toLowerCase()
  const ef =
    offer.everflow_offer_id != null ? String(offer.everflow_offer_id) : ""
  if (name.includes(query) || ref.includes(query)) {
    return true
  }
  if (ef !== "" && (ef.includes(query) || query.includes(ef))) {
    return true
  }
  const stripped = query.replace(/^(ef|#)\s*/i, "")
  if (stripped !== "" && ef !== "" && ef.includes(stripped)) {
    return true
  }
  return false
}

export function filterOffersByQuery<T extends OfferSearchable>(
  offers: readonly T[],
  rawQuery: string
): T[] {
  const query = normalizeOfferQuery(rawQuery)
  if (query === "") {
    return [...offers]
  }
  return offers.filter((offer) => offerMatchesQuery(offer, query))
}
