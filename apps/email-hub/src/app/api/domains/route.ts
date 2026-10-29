import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import { assertStaffApiCaller } from "@/lib/auth/require-machine"
import { requireRole } from "@/lib/auth/require-role"
import { minRoleForStaffApi } from "@/lib/permission-map"

/**
 * Domains list (staff). Empty shell until Domains CRUD; powers T-050 query usage.
 * Contract: `{ data, next_cursor }` (SD#10.1).
 */
export async function GET(request: Request) {
  try {
    assertStaffApiCaller(request)
    const minRole = minRoleForStaffApi("GET", new URL(request.url).pathname)
    if (!minRole) {
      throw AppError.forbidden()
    }
    await requireRole(minRole)

    return Response.json({
      data: [],
      next_cursor: null,
    })
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}
