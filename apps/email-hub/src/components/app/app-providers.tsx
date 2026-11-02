"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

import { ConflictDialogProvider } from "@/components/app/conflict-dialog-provider"
import { createQueryClient } from "@/lib/query-client"

/** Client providers shared by auth and app shells (T-050). */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ConflictDialogProvider>{children}</ConflictDialogProvider>
    </QueryClientProvider>
  )
}
