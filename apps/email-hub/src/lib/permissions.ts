import type { SessionUser } from "@/lib/auth"

export function canAccessAdmin(user: SessionUser | null): boolean {
  return user?.role === "admin" || user?.role === "operator"
}

export function canManageUsers(user: SessionUser | null): boolean {
  return user?.role === "admin"
}
