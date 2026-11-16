import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { inviteUserBodySchema } from "@/lib/users/schemas"
import { inviteUser } from "@/lib/users/service"
import { requireUsersStaffAccess } from "@/lib/users/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** POST /api/admin/users/invitations — invite by email and role (Admin). */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireUsersStaffAccess(request)
  const body = parseOrThrow(inviteUserBodySchema, await parseJsonBody(request))
  const invitation = await inviteUser(
    { email: body.email, role: body.role },
    {
      userId: session.id,
      requestId: getRequestId() ?? null,
    }
  )
  return Response.json(invitation, { status: invitation.created ? 201 : 200 })
}

export const POST = handler(handlePost)
