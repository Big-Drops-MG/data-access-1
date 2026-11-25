"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { fetchUsersList } from "@/features/users/api"
import { listQueryOptions } from "@/lib/query-options"

export function useUsersList() {
  return useQuery({
    ...listQueryOptions("users", () => fetchUsersList()),
    placeholderData: keepPreviousData,
  })
}
