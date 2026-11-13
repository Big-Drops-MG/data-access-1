import { getRequestId } from "@workspace/logger"

import { logAuthEvent } from "@/lib/auth/auth-events"
import { handler } from "@/lib/handler"
import { parseUserIdParam } from "@/lib/users/params"
import { resetManagedUserTwoFactor } from "@/lib/users/service"
import { requireUsersStaffAccess } from "@/lib/users/staff-access"

type RouteContext = {
  params: Promise<{ userId: string }>
}

/** Admin-only 2FA reset (SD#9.11 / T-030 / T-040 / T-082). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireUsersStaffAccess(request)
  const { userId: rawUserId } = await context.params
  const userId = parseUserIdParam(rawUserId)

  await resetManagedUserTwoFactor(userId, {
    userId: session.id,
    requestId: getRequestId() ?? null,
  })
  logAuthEvent("auth.2fa_reset", {
    user_id: userId,
    admin_user_id: session.id,
  })

  return Response.json({ ok: true })
}

export const POST = handler(handlePost)
