"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import {
  fetchActiveOffersForRoute,
  fetchActiveSendersForRoute,
  fetchOffersForRouteLookup,
  fetchPublishedTemplatesForRoute,
  fetchSendersForRouteLookup,
  fetchTemplatesForRouteLookup,
  type EmailRouteEmailType,
} from "@/features/email-routes/api"
import { listQueryOptions } from "@/lib/query-options"

export function useRouteFormOptions(
  emailType: EmailRouteEmailType | "",
  offerId: string | null = null
) {
  const templateFilters = {
    email_type: emailType || "thank_you",
    offer_id: offerId ?? undefined,
  }
  const senderFilters = { offer_id: offerId ?? undefined }

  const templates = useQuery({
    ...listQueryOptions(
      "email-routes-form-templates",
      () =>
        fetchPublishedTemplatesForRoute({
          email_type: emailType || "thank_you",
          offer_id: offerId ?? undefined,
        }),
      templateFilters
    ),
    enabled: Boolean(emailType),
  })

  const senders = useQuery({
    ...listQueryOptions(
      "email-routes-form-senders",
      () =>
        fetchActiveSendersForRoute({
          offer_id: offerId ?? undefined,
        }),
      senderFilters
    ),
  })

  const offers = useQuery({
    ...listQueryOptions("email-routes-form-offers", () =>
      fetchActiveOffersForRoute()
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
    isPending: Boolean(emailType) && templates.isPending,
    lookupsPending: senders.isPending || offers.isPending,
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

/** Lookups used to label rows on the routes list. */
export function useRouteListLookups() {
  const senders = useQuery({
    ...listQueryOptions("email-routes-list-senders", () =>
      fetchSendersForRouteLookup()
    ),
  })
  const offers = useQuery({
    ...listQueryOptions("email-routes-list-offers", () =>
      fetchOffersForRouteLookup()
    ),
  })
  const thankYou = useQuery({
    ...listQueryOptions(
      "email-routes-list-templates",
      () => fetchTemplatesForRouteLookup({ email_type: "thank_you" }),
      { email_type: "thank_you", scope: "lookup" }
    ),
  })
  const feedback = useQuery({
    ...listQueryOptions(
      "email-routes-list-templates",
      () => fetchTemplatesForRouteLookup({ email_type: "feedback_request" }),
      { email_type: "feedback_request", scope: "lookup" }
    ),
  })
  const engagement = useQuery({
    ...listQueryOptions(
      "email-routes-list-templates",
      () => fetchTemplatesForRouteLookup({ email_type: "engagement" }),
      { email_type: "engagement", scope: "lookup" }
    ),
  })

  const templatesById = useMemo(() => {
    const map = new Map<string, { name: string; version: number | null }>()
    for (const row of [
      ...(thankYou.data?.data ?? []),
      ...(feedback.data?.data ?? []),
      ...(engagement.data?.data ?? []),
    ]) {
      map.set(row.id, {
        name: row.name,
        version: row.current_version_no,
      })
    }
    return map
  }, [engagement.data?.data, feedback.data?.data, thankYou.data?.data])

  const sendersById = useMemo(() => {
    const map = new Map<string, { from_email: string; from_name: string }>()
    for (const row of senders.data?.data ?? []) {
      map.set(row.id, {
        from_email: row.from_email,
        from_name: row.from_name,
      })
    }
    return map
  }, [senders.data?.data])

  const offersById = useMemo(() => {
    const map = new Map<string, { name: string; external_ref: string }>()
    for (const row of offers.data?.data ?? []) {
      map.set(row.id, {
        name: row.name,
        external_ref: row.external_ref,
      })
    }
    return map
  }, [offers.data?.data])

  return { templatesById, sendersById, offersById }
}
