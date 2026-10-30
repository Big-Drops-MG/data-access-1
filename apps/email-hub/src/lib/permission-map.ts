import type { AppRole } from "@/lib/permissions"

/**
 * Staff API permission map (SD#4 rule 3).
 * Missing entries deny. Patterns use `*` for a single path segment.
 */
export const STAFF_API_MIN_ROLE: Readonly<Record<string, AppRole>> = {
  "POST /api/admin/users/*/two-factor/reset": "admin",
  "GET /api/domains": "viewer",
  "POST /api/domains": "admin",
  "GET /api/domains/*": "viewer",
  "PATCH /api/domains/*": "admin",
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

function patternMatches(patternPath: string, pathname: string): boolean {
  const patternParts = patternPath.split("/").filter(Boolean)
  const pathParts = pathname.split("/").filter(Boolean)
  if (patternParts.length !== pathParts.length) {
    return false
  }
  return patternParts.every(
    (part, index) => part === "*" || part === pathParts[index]
  )
}

/**
 * Minimum role for a staff API route. `null` means deny (not in the map).
 */
export function minRoleForStaffApi(
  method: string,
  pathname: string
): AppRole | null {
  const normalizedMethod = method.toUpperCase()
  const path = normalizePath(pathname)

  for (const [key, role] of Object.entries(STAFF_API_MIN_ROLE)) {
    const space = key.indexOf(" ")
    if (space <= 0) {
      continue
    }
    const keyMethod = key.slice(0, space)
    const keyPath = key.slice(space + 1)
    if (keyMethod !== normalizedMethod) {
      continue
    }
    if (patternMatches(keyPath, path)) {
      return role
    }
  }

  return null
}

/** HTTP methods that mutate state and require Operator+ when mapped as writes. */
export function isWriteMethod(method: string): boolean {
  const normalized = method.toUpperCase()
  return (
    normalized === "POST" ||
    normalized === "PUT" ||
    normalized === "PATCH" ||
    normalized === "DELETE"
  )
}
