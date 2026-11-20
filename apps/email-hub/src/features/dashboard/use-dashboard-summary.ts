"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchDashboardSummary } from "@/features/dashboard/api"
import { listQueryOptions } from "@/lib/query-options"

export function useDashboardSummary() {
  return useQuery(
    listQueryOptions("dashboard", () => fetchDashboardSummary(), "summary")
  )
}
