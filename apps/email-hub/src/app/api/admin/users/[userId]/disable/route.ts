import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { parseUserIdParam } from "@/lib/users/params"
import { disableUser } from "@/lib/users/service"
import { requireUsersStaffAccess } from "@/lib/users/staff-access"

type RouteContext = {
  params: Promise<{ userId: string }>
}

/** POST /api/admin/users/:userId/disable — deactivate and revoke access (Admin). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireUsersStaffAccess(request)
  const { userId: rawUserId } = await context.params
  const userId = parseUserIdParam(rawUserId)
  const disabled = await disableUser(userId, {
    userId: session.id,
    requestId: getRequestId() ?? null,
  })
  return Response.json(disabled)
}

export const POST = handler(handlePost)
