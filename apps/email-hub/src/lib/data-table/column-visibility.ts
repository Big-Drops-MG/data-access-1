import type { VisibilityState } from "@tanstack/react-table"

export function columnVisibilityStorageKey(feature: string): string {
  return `email-hub:datatable:columns:${feature}`
}

export function readColumnVisibility(feature: string): VisibilityState {
  try {
    const raw = localStorage.getItem(columnVisibilityStorageKey(feature))
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {}
    }
    const result: VisibilityState = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        result[key] = value
      }
    }
    return result
  } catch {
    return {}
  }
}

export function writeColumnVisibility(
  feature: string,
  visibility: VisibilityState
): void {
  try {
    localStorage.setItem(
      columnVisibilityStorageKey(feature),
      JSON.stringify(visibility)
    )
  } catch {
    // localStorage may be unavailable (private mode, quota, SSR)
  }
}
