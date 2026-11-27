"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { listQueryOptions } from "@/lib/query-options"

import {
  fetchInboxPlacement,
  fetchReport,
  type InboxPlacementPayload,
  type ReportPayload,
} from "./api"

type ReportsQueries = {
  sending: UseQueryResult<ReportPayload>
  engagement: UseQueryResult<ReportPayload>
  links: UseQueryResult<ReportPayload>
  environment: UseQueryResult<ReportPayload>
  frequency: UseQueryResult<ReportPayload>
  provider: UseQueryResult<ReportPayload>
  inbox: UseQueryResult<InboxPlacementPayload>
}

export function useReportsQueries(input: {
  from: string
  to: string
  includeMachine: boolean
  domain: string | null
}): ReportsQueries {
  const range = { from: input.from, to: input.to }
  const machine = { includeMachine: input.includeMachine }
  const sending = useQuery(
    listQueryOptions("reports", () => fetchReport("sending", range), [
      "sending",
      input.from,
      input.to,
    ])
  )
  const engagement = useQuery(
    listQueryOptions(
      "reports",
      () => fetchReport("engagement", { ...range, ...machine }),
      ["engagement", input.from, input.to, input.includeMachine]
    )
  )
  const links = useQuery(
    listQueryOptions(
      "reports",
      () => fetchReport("link-clicks", { ...range, ...machine }),
      ["link-clicks", input.from, input.to, input.includeMachine]
    )
  )
  const environment = useQuery(
    listQueryOptions(
      "reports",
      () => fetchReport("environment", { ...range, ...machine }),
      ["environment", input.from, input.to, input.includeMachine]
    )
  )
  const frequency = useQuery(
    listQueryOptions(
      "reports",
      () =>
        fetchReport("open-frequency", {
          ...range,
          ...machine,
          domain: input.domain ?? undefined,
        }),
      [
        "open-frequency",
        input.from,
        input.to,
        input.includeMachine,
        input.domain,
      ]
    )
  )
  const provider = useQuery(
    listQueryOptions("reports", () => fetchReport("provider-metrics", range), [
      "provider-metrics",
      input.from,
      input.to,
    ])
  )
  const inbox = useQuery(
    listQueryOptions("reports", () => fetchInboxPlacement(range), [
      "inbox-placement",
      input.from,
      input.to,
    ])
  )

  return {
    sending,
    engagement,
    links,
    environment,
    frequency,
    provider,
    inbox,
  }
}
