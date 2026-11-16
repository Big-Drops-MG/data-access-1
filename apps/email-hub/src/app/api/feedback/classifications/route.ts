import { jsonForRole } from "@/lib/api-response"
import { requireFeedbackStaffAccess } from "@/lib/feedback/staff-access"
import { listFeedbackClassifications } from "@/lib/feedback/service"
import { handler } from "@/lib/handler"

/** GET /api/feedback/classifications — active classifications (Viewer+). */
async function handleGet(request: Request): Promise<Response> {
  const session = await requireFeedbackStaffAccess(request, "GET")
  const result = await listFeedbackClassifications()
  return jsonForRole(session.role, result)
}

export const GET = handler(handleGet)
