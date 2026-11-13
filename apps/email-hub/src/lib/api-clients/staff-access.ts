import { AppError } from "@workspace/shared"

import type { SessionUser } from "@/lib/auth"
import { assertStaffApiCaller } from "@/lib/auth/require-machine"
import { requireRole } from "@/lib/auth/require-role"
import { minRoleForStaffApi } from "@/lib/permission-map"

/** Admin session gate for `/api/admin/api-clients*` (deny-by-default). */
export async function requireApiClientsStaffAccess(
  request: Request
): Promise<SessionUser> {
  assertStaffApiCaller(request)
  const minRole = minRoleForStaffApi(
    request.method,
    new URL(request.url).pathname
  )
  if (!minRole) {
    throw AppError.forbidden()
  }
  return requireRole(minRole)
}
