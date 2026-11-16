import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { parseApiClientId } from "@/lib/api-clients/params"
import { disableApiClient } from "@/lib/api-clients/service"
import { requireApiClientsStaffAccess } from "@/lib/api-clients/staff-access"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/admin/api-clients/:id/disable — revoke the client (Admin). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireApiClientsStaffAccess(request)
  const { id: rawId } = await context.params
  const disabled = await disableApiClient(parseApiClientId(rawId), {
    userId: session.id,
    requestId: getRequestId() ?? null,
  })
  return Response.json(disabled)
}

export const POST = handler(handlePost)
