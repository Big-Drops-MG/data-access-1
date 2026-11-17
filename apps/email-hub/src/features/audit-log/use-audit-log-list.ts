"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchAuditLogList,
  type AuditLogListParams,
} from "@/features/audit-log/api"
import { listQueryOptions } from "@/lib/query-options"

export function useAuditLogList(params: AuditLogListParams = {}) {
  return useQuery({
    ...listQueryOptions("audit-log", () => fetchAuditLogList(params), params),
    placeholderData: keepPreviousData,
  })
}
