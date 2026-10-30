import { AppError } from "@workspace/shared"

import type { SessionUser } from "@/lib/auth"
import { assertStaffApiCaller } from "@/lib/auth/require-machine"
import { requireRole } from "@/lib/auth/require-role"
import { minRoleForStaffApi } from "@/lib/permission-map"

export async function requireDomainsStaffAccess(
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
