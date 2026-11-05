import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { sendIdParamSchema, sendVersionBodySchema } from "@/lib/sends/schemas"
import { scheduleSend } from "@/lib/sends/service"
import { requireSendsStaffAccess } from "@/lib/sends/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/sends/{id}/schedule — draft to scheduled (Operator+). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireSendsStaffAccess(request, "POST")
  const { id: rawId } = await context.params
  const id = parseOrThrow(sendIdParamSchema, rawId)
  const body = parseOrThrow(sendVersionBodySchema, await parseJsonBody(request))

  const scheduled = await scheduleSend(id, body.version, {
    userId: session.id,
    requestId: getRequestId(),
  })

  return Response.json(scheduled)
}

export const POST = handler(handlePost)
