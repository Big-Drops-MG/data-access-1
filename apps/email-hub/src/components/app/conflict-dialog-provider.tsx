"use client"

import { useEffect, type ReactNode } from "react"

import { ConflictDialog } from "@/components/app/conflict-dialog"
import { useConflictDialog } from "@/hooks/use-conflict-dialog"
import { registerConflictPresenter } from "@/lib/conflict-bridge"

/**
 * Hosts the global 409 dialog and registers it with the mutation cache (T-050).
 */
export function ConflictDialogProvider({ children }: { children: ReactNode }) {
  const conflict = useConflictDialog()

  useEffect(() => {
    registerConflictPresenter(conflict.presentConflict)
    return () => {
      registerConflictPresenter(null)
    }
  }, [conflict.presentConflict])

  return (
    <>
      {children}
      <ConflictDialog
        open={conflict.open}
        onOpenChange={conflict.onOpenChange}
        onReload={conflict.onReload}
      />
    </>
  )
}
