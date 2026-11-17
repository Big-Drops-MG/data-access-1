"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useQuery } from "@tanstack/react-query"

import { fetchOffers } from "@/features/offers/api"
import type { OfferListItemJson } from "@/lib/offers/serialize"
import {
  readOfferCookie,
  resolveSelectedOfferId,
  writeOfferCookie,
} from "@/lib/offer-selection"
import { listQueryOptions } from "@/lib/query-options"

type OfferContextValue = {
  offers: OfferListItemJson[]
  selectedOfferId: string | null
  selectedOffer: OfferListItemJson | null
  setSelectedOfferId: (offerId: string | null) => void
  isLoading: boolean
  isError: boolean
}

const OfferContext = createContext<OfferContextValue | null>(null)

export function OfferProvider({ children }: { children: ReactNode }) {
  const [preferredId, setPreferredId] = useState<string | null>(() =>
    readOfferCookie()
  )

  const list = useQuery({
    ...listQueryOptions(
      "offers",
      () => fetchOffers({ status: "active", limit: 200 }),
      { status: "active", limit: 200 }
    ),
  })

  const offers = useMemo(() => list.data?.data ?? [], [list.data?.data])
  const selectedOfferId = resolveSelectedOfferId(offers, preferredId)
  const selectedOffer =
    offers.find((offer) => offer.id === selectedOfferId) ?? null

  const setSelectedOfferId = useCallback((offerId: string | null) => {
    setPreferredId(offerId)
    writeOfferCookie(offerId)
  }, [])

  const value = useMemo<OfferContextValue>(
    () => ({
      offers,
      selectedOfferId,
      selectedOffer,
      setSelectedOfferId,
      isLoading: list.isPending,
      isError: list.isError,
    }),
    [
      offers,
      selectedOfferId,
      selectedOffer,
      setSelectedOfferId,
      list.isPending,
      list.isError,
    ]
  )

  return <OfferContext.Provider value={value}>{children}</OfferContext.Provider>
}

export function useOfferSelection(): OfferContextValue {
  const value = useContext(OfferContext)
  if (!value) {
    throw new Error("useOfferSelection must be used within OfferProvider")
  }
  return value
}

/** Safe for components that may render outside the app shell. */
export function useOptionalOfferSelection(): OfferContextValue | null {
  return useContext(OfferContext)
}
