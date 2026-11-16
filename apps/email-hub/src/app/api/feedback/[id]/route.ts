import { jsonForRole } from "@/lib/api-response"
import { requireFeedbackStaffAccess } from "@/lib/feedback/staff-access"
import { feedbackIdParamSchema } from "@/lib/feedback/schemas"
import { getFeedback } from "@/lib/feedback/service"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** GET /api/feedback/{id} — feedback detail (Viewer+). */
async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireFeedbackStaffAccess(request, "GET")
  const { id: rawId } = await context.params
  const id = parseOrThrow(feedbackIdParamSchema, rawId)

  const item = await getFeedback(id)
  return jsonForRole(session.role, item)
}

export const GET = handler(handleGet)
