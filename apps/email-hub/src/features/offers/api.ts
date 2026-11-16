import { apiJson } from "@/lib/api-client"
import type { OfferJson, OfferListItemJson } from "@/lib/offers/serialize"

export type OffersListResponse = {
  data: OfferListItemJson[]
}

export function fetchOffers(params?: {
  status?: "active" | "inactive"
  limit?: number
}): Promise<OffersListResponse> {
  const search = new URLSearchParams()
  if (params?.status) {
    search.set("status", params.status)
  }
  if (params?.limit) {
    search.set("limit", String(params.limit))
  }
  const query = search.toString()
  return apiJson<OffersListResponse>(`/api/offers${query ? `?${query}` : ""}`)
}

export function importOffer(everflowOfferId: number): Promise<OfferJson> {
  return apiJson<OfferJson>("/api/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ everflow_offer_id: everflowOfferId }),
  })
}

export function fetchOfferByEverflowId(
  everflowOfferId: number
): Promise<OfferJson> {
  return apiJson<OfferJson>(
    `/api/offers/${encodeURIComponent(String(everflowOfferId))}`
  )
}
