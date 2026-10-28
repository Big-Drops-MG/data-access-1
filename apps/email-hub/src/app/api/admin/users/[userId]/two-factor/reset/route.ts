import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import { logAuthEvent } from "@/lib/auth/auth-events"
import { assertStaffApiCaller } from "@/lib/auth/require-machine"
import { requireRole } from "@/lib/auth/require-role"
import { resetTwoFactorForAdmin } from "@/lib/auth/two-factor-lockout"
import { minRoleForStaffApi } from "@/lib/permission-map"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RouteContext = {
  params: Promise<{ userId: string }>
}

/** Admin-only 2FA reset (SD#9.11 / T-030 / T-040). */
export async function POST(request: Request, context: RouteContext) {
  try {
    assertStaffApiCaller(request)

    const minRole = minRoleForStaffApi("POST", new URL(request.url).pathname)
    if (!minRole) {
      throw AppError.forbidden()
    }
    const session = await requireRole(minRole)

    const { userId } = await context.params
    if (!UUID_RE.test(userId)) {
      throw AppError.badRequest([{ path: "userId", message: "Must be a uuid" }])
    }

    await resetTwoFactorForAdmin(userId)
    logAuthEvent("auth.2fa_reset", {
      user_id: userId,
      admin_user_id: session.id,
    })

    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}
