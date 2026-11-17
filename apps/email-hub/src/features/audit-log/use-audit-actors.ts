"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchAuditActors } from "@/features/audit-log/api"
import { listQueryOptions } from "@/lib/query-options"

export function useAuditActors() {
  return useQuery({
    ...listQueryOptions("audit-log-actors", () => fetchAuditActors()),
  })
}
