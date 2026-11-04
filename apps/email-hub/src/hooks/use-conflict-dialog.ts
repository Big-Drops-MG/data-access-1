"use client"

import { useCallback, useState } from "react"

import { isConflictError } from "@/lib/api-client"

/**
 * State helper for 409 conflict UI (SD#12.4 / T-050).
 * Keeps form values; `onReload` is for loading the newer server copy.
 */
export function useConflictDialog() {
  const [open, setOpen] = useState(false)
  const [reloadHandler, setReloadHandler] = useState<(() => void) | null>(null)

  const presentConflict = useCallback((onReload: () => void) => {
    setReloadHandler(() => onReload)
    setOpen(true)
  }, [])

  const handleReload = useCallback(() => {
    reloadHandler?.()
    setOpen(false)
  }, [reloadHandler])

  return {
    open,
    onOpenChange: setOpen,
    onReload: handleReload,
    presentConflict,
    isConflictError,
  }
}
