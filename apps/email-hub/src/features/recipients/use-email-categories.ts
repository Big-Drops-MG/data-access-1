"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchEmailCategories } from "@/features/recipients/api"
import { listQueryOptions } from "@/lib/query-options"

export function useEmailCategories() {
  return useQuery({
    ...listQueryOptions("email-categories", () => fetchEmailCategories()),
  })
}
