"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { useOfferSelection } from "@/components/app/offer-provider"
import {
  fetchActiveSenderRows,
  fetchOffers,
  fetchPublishedTemplateRows,
  SEND_OPTIONS_SENDER_PARAMS,
  SEND_OPTIONS_TEMPLATE_PARAMS,
} from "@/features/sends/api"
import { listQueryOptions } from "@/lib/query-options"

const OFFERS_PARAMS = { status: "active" as const }

export function useSendFormOptions() {
  const { selectedOfferId } = useOfferSelection()
  const templateParams = {
    ...SEND_OPTIONS_TEMPLATE_PARAMS,
    offer_id: selectedOfferId ?? undefined,
  }
  const senderParams = {
    ...SEND_OPTIONS_SENDER_PARAMS,
    offer_id: selectedOfferId ?? undefined,
  }

  const templates = useQuery({
    ...listQueryOptions(
      "sends-form-templates",
      () =>
        fetchPublishedTemplateRows({
          offer_id: selectedOfferId ?? undefined,
        }),
      templateParams
    ),
  })
  const senders = useQuery({
    ...listQueryOptions(
      "sends-form-senders",
      () =>
        fetchActiveSenderRows({
          offer_id: selectedOfferId ?? undefined,
        }),
      senderParams
    ),
  })
  const offers = useQuery({
    ...listQueryOptions(
      "sends-form-offers",
      () => fetchOffers(),
      OFFERS_PARAMS
    ),
  })

  const publishedTemplates = useMemo(
    () =>
      (templates.data?.data ?? []).filter(
        (template) =>
          template.status === "active" && template.current_version_id != null
      ),
    [templates.data?.data]
  )

  const queries = [templates, senders, offers]
  const error = queries.find((query) => query.isError)?.error ?? null

  return {
    templates: publishedTemplates,
    senders: senders.data?.data ?? [],
    offers: offers.data?.data ?? [],
    isPending: queries.some((query) => query.isPending),
    error,
    refetch: () => {
      for (const query of queries) {
        if (query.isError) {
          void query.refetch()
        }
      }
    },
  }
}
