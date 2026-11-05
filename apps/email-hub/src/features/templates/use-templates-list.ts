"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchTemplatesList,
  type TemplatesListParams,
} from "@/features/templates/api"
import { listQueryOptions } from "@/lib/query-options"

export function useTemplatesList(params: TemplatesListParams = {}) {
  return useQuery({
    ...listQueryOptions("templates", () => fetchTemplatesList(params), params),
    placeholderData: keepPreviousData,
  })
}
