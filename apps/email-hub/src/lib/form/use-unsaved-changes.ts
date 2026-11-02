"use client"

import { useEffect } from "react"

/**
 * Browser leave prompt when a form is dirty (SD#12.6).
 * Covers refresh / tab close via `beforeunload`.
 */
export function useUnsavedChanges(isDirty: boolean, enabled = true): void {
  useEffect(() => {
    if (!enabled || !isDirty) {
      return
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [enabled, isDirty])
}
