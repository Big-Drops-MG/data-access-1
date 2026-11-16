export function isActiveAdmin(row: { role: string; status: string }): boolean {
  return row.role === "admin" && row.status === "active"
}

/**
 * True when this change would leave zero active Admins.
 * Callers must count inside the same transaction that holds the admin lock.
 */
export function removalLeavesNoActiveAdmin(input: {
  targetIsActiveAdmin: boolean
  activeAdminCount: number
}): boolean {
  return input.targetIsActiveAdmin && input.activeAdminCount <= 1
}

export function isSameUser(actorId: string, targetId: string): boolean {
  return actorId.toLowerCase() === targetId.toLowerCase()
}
