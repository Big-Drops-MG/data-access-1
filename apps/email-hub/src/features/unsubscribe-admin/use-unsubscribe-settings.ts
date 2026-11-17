"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  fetchUnsubscribeSettings,
  patchUnsubscribeSettings,
  verifyUnsubscribeDomain,
  type PatchUnsubscribeSettingsInput,
} from "@/features/unsubscribe-admin/api"

const SETTINGS_KEY = ["unsubscribe-settings"] as const

export function useUnsubscribeSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchUnsubscribeSettings,
  })
}

export function usePatchUnsubscribeSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: PatchUnsubscribeSettingsInput) =>
      patchUnsubscribeSettings(input),
    onSuccess: (data) => {
      client.setQueryData(SETTINGS_KEY, data)
    },
  })
}

export function useVerifyUnsubscribeDomain() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: verifyUnsubscribeDomain,
    onSuccess: (data) => {
      client.setQueryData(SETTINGS_KEY, data)
    },
  })
}
