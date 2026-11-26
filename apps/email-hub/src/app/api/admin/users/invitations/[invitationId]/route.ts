import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { parseUserIdParam } from "@/lib/users/params"
import { revokeInvitation } from "@/lib/users/service"
import { requireUsersStaffAccess } from "@/lib/users/staff-access"

type RouteContext = {
  params: Promise<{ invitationId: string }>
}

/** DELETE /api/admin/users/invitations/:invitationId — revoke a pending invitation (Admin). */
async function handleDelete(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireUsersStaffAccess(request)
  const { invitationId: rawInvitationId } = await context.params
  const invitationId = parseUserIdParam(rawInvitationId)
  const result = await revokeInvitation(invitationId, {
    userId: session.id,
    requestId: getRequestId() ?? null,
  })
  return Response.json(result)
}

export const DELETE = handler(handleDelete)
