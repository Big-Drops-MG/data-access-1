import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { parseApiClientId } from "@/lib/api-clients/params"
import { rotateApiClientSecret } from "@/lib/api-clients/service"
import { requireApiClientsStaffAccess } from "@/lib/api-clients/staff-access"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/admin/api-clients/:id/rotate — new secret once; previous lasts 24h (Admin). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireApiClientsStaffAccess(request)
  const { id: rawId } = await context.params
  const rotated = await rotateApiClientSecret(parseApiClientId(rawId), {
    userId: session.id,
    requestId: getRequestId() ?? null,
  })
  return Response.json(rotated)
}

export const POST = handler(handlePost)
