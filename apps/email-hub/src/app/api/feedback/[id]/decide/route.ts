import { getRequestId } from "@workspace/logger"

import { jsonForRole } from "@/lib/api-response"
import { requireFeedbackStaffAccess } from "@/lib/feedback/staff-access"
import {
  decideFeedbackBodySchema,
  feedbackIdParamSchema,
} from "@/lib/feedback/schemas"
import { decideFeedback } from "@/lib/feedback/service"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/feedback/{id}/decide — resolve with outcome (Operator+). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireFeedbackStaffAccess(request, "POST")
  const { id: rawId } = await context.params
  const id = parseOrThrow(feedbackIdParamSchema, rawId)
  const body = parseOrThrow(
    decideFeedbackBodySchema,
    await parseJsonBody(request)
  )

  const decided = await decideFeedback(
    id,
    {
      classificationId: body.classification_id,
      decision: body.decision,
    },
    {
      userId: session.id,
      requestId: getRequestId(),
    }
  )

  return jsonForRole(session.role, decided)
}

export const POST = handler(handlePost)
