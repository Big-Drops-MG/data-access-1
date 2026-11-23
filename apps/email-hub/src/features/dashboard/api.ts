import type { AlertJson } from "@/lib/alerts/serialize"
import { apiJson } from "@/lib/api-client"
import type { SendJson } from "@/lib/sends/serialize"
import type { EmailRouteJson } from "@/lib/email-routes/serialize"

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

export type DashboardEmailRoute = {
  id: string
  email_type: EmailRouteJson["email_type"]
  offer_id: string | null
  offer_name: string | null
  template_name: string
  sender_email: string
  status: EmailRouteJson["status"]
}

export type DashboardSummary = {
  day: string
  kpis: DashboardKpis
  queues: DashboardQueueCounts[]
  open_alerts: AlertJson[]
  recent_sends: SendJson[]
  upcoming_sends: SendJson[]
  email_routes: DashboardEmailRoute[]
}

export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiJson<DashboardSummary>("/api/dashboard")
}
