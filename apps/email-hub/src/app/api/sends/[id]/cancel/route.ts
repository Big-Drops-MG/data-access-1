import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { sendIdParamSchema, sendVersionBodySchema } from "@/lib/sends/schemas"
import { cancelSend } from "@/lib/sends/service"
import { requireSendsStaffAccess } from "@/lib/sends/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/sends/{id}/cancel — scheduled to cancelled (Operator+). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireSendsStaffAccess(request, "POST")
  const { id: rawId } = await context.params
  const id = parseOrThrow(sendIdParamSchema, rawId)
  const body = parseOrThrow(sendVersionBodySchema, await parseJsonBody(request))

  const cancelled = await cancelSend(id, body.version, {
    userId: session.id,
    requestId: getRequestId(),
  })

  return Response.json(cancelled)
}

export const POST = handler(handlePost)
