import { AppError } from "@workspace/shared"

import type { SessionUser } from "@/lib/auth"
import { assertStaffApiCaller } from "@/lib/auth/require-machine"
import { requireRole } from "@/lib/auth/require-role"
import { minRoleForStaffApi } from "@/lib/permission-map"

/**
 * Staff session gate for `/api/alerts*`.
 * No earlier alert permission existed, so list and acknowledge are Operator+.
 * Admin passes that rank. Viewer is denied.
 */
export async function requireAlertsStaffAccess(
  request: Request,
  method: string
): Promise<SessionUser> {
  assertStaffApiCaller(request)
  const minRole = minRoleForStaffApi(method, new URL(request.url).pathname)
  if (!minRole) {
    throw AppError.forbidden()
  }
  return requireRole(minRole)
}
