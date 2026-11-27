import { apiJson } from "@/lib/api-client"

export type ReportPayload = {
  name: string
  from: string
  to: string
  include_machine: boolean
  data: Record<string, unknown>[]
}

export type InboxPlacementPayload = {
  from: string
  to: string
  placement: Array<{
    provider: string
    label: string
    inbox: number
    promotions: number
    spam: number
    source: string
    confidence_label: string
    confidence_tone: "ok" | "warn"
  }>
  latest_sends: Array<{
    id: string
    sent_at: string | null
    template: string
    placements: Partial<
      Record<string, "inbox" | "promotions" | "spam" | "missing">
    >
  }>
  blocklists: Array<{
    target: string
    spamhaus: "clean" | "listed" | "unknown" | null
    barracuda: "clean" | "listed" | "unknown" | null
    checked_at: string
  }>
}

export function fetchReport(
  name: string,
  query: {
    from: string
    to: string
    includeMachine?: boolean
    domain?: string
  }
): Promise<ReportPayload> {
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
  })
  if (query.includeMachine) {
    params.set("include_machine", "true")
  }
  if (query.domain) {
    params.set("domain", query.domain)
  }
  return apiJson<ReportPayload>(`/api/reports/${name}?${params.toString()}`)
}

export function fetchInboxPlacement(query: {
  from: string
  to: string
}): Promise<InboxPlacementPayload> {
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
  })
  return apiJson<InboxPlacementPayload>(
    `/api/reports/inbox-placement?${params.toString()}`
  )
}
