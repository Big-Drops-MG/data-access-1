import { jsonForRole } from "@/lib/api-response"
import { requireFeedbackStaffAccess } from "@/lib/feedback/staff-access"
import { feedbackListQuerySchema } from "@/lib/feedback/schemas"
import { listFeedback } from "@/lib/feedback/service"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

/** GET /api/feedback — list feedback items (Viewer+). */
async function handleGet(request: Request): Promise<Response> {
  const session = await requireFeedbackStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    feedbackListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listFeedback({
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
  })

  return jsonForRole(session.role, result)
}

export const GET = handler(handleGet)
