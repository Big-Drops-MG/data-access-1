import { getRequestId } from "@workspace/logger"

import { jsonForRole } from "@/lib/api-response"
import { requireAlertsStaffAccess } from "@/lib/alerts/staff-access"
import { alertIdParamSchema } from "@/lib/alerts/schemas"
import { acknowledgeAlert } from "@/lib/alerts/service"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/alerts/{id}/ack — first acknowledgment (Operator+). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireAlertsStaffAccess(request, "POST")
  const { id: rawId } = await context.params
  const id = parseOrThrow(alertIdParamSchema, rawId)

  const acknowledged = await acknowledgeAlert(id, {
    userId: session.id,
    requestId: getRequestId(),
  })

  return jsonForRole(session.role, acknowledged)
}

export const POST = handler(handlePost)
