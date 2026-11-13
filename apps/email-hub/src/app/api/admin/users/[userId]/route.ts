import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { parseUserIdParam } from "@/lib/users/params"
import { updateUserRoleBodySchema } from "@/lib/users/schemas"
import { updateUserRole } from "@/lib/users/service"
import { requireUsersStaffAccess } from "@/lib/users/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ userId: string }>
}

/** PATCH /api/admin/users/:userId — change role (Admin). */
async function handlePatch(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireUsersStaffAccess(request)
  const { userId: rawUserId } = await context.params
  const userId = parseUserIdParam(rawUserId)
  const body = parseOrThrow(
    updateUserRoleBodySchema,
    await parseJsonBody(request)
  )
  const updated = await updateUserRole(userId, body.role, {
    userId: session.id,
    requestId: getRequestId() ?? null,
  })
  return Response.json(updated)
}

export const PATCH = handler(handlePatch)
