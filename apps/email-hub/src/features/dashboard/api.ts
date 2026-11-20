import type { AlertJson } from "@/lib/alerts/serialize"
import { apiJson } from "@/lib/api-client"
import type { SendJson } from "@/lib/sends/serialize"

export type DashboardKpis = {
  sent: number
  delivered: number
  bounced: number
  complaints: number
}

export type DashboardQueueCounts = {
  queue: string
  waiting: number
  active: number
  failed: number
  delayed: number
}

export type DashboardSummary = {
  day: string
  kpis: DashboardKpis
  queues: DashboardQueueCounts[]
  open_alerts: AlertJson[]
  recent_sends: SendJson[]
  upcoming_sends: SendJson[]
}

export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiJson<DashboardSummary>("/api/dashboard")
}
