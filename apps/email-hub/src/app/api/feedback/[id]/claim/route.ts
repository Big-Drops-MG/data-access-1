import { getRequestId } from "@workspace/logger"

import { jsonForRole } from "@/lib/api-response"
import { requireFeedbackStaffAccess } from "@/lib/feedback/staff-access"
import { feedbackIdParamSchema } from "@/lib/feedback/schemas"
import { claimFeedback } from "@/lib/feedback/service"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/feedback/{id}/claim — claim for review (Operator+). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireFeedbackStaffAccess(request, "POST")
  const { id: rawId } = await context.params
  const id = parseOrThrow(feedbackIdParamSchema, rawId)

  const claimed = await claimFeedback(id, {
    userId: session.id,
    requestId: getRequestId(),
  })

  return jsonForRole(session.role, claimed)
}

export const POST = handler(handlePost)
