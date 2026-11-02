import type { SessionUser } from "@/lib/auth"

export type AppRole = SessionUser["role"]

/** Higher number = more privilege (SD#4). */
export const ROLE_RANK: Record<AppRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
}

export const APP_ROLES = ["viewer", "operator", "admin"] as const

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value)
}

/** Deny-by-default: null user never passes. */
export function hasAtLeastRole(
  user: SessionUser | null | undefined,
  minimum: AppRole
): boolean {
  if (!user) {
    return false
  }
  return ROLE_RANK[user.role] >= ROLE_RANK[minimum]
}

/** Operator+ (legacy helper for admin-area chrome). */
export function canAccessAdmin(user: SessionUser | null): boolean {
  return hasAtLeastRole(user, "operator")
}

/** Admin-only user management / 2FA reset. */
export function canManageUsers(user: SessionUser | null): boolean {
  return hasAtLeastRole(user, "admin")
}

/** Viewers may not perform staff writes (SD#4 / T-040). */
export function canWriteStaff(user: SessionUser | null): boolean {
  return hasAtLeastRole(user, "operator")
}
