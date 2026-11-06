import { jsonForRole } from "@/lib/api-response"
import { handler } from "@/lib/handler"
import { suppressionIdParamSchema } from "@/lib/suppressions/schemas"
import { removeSuppression } from "@/lib/suppressions/service"
import { requireSuppressionsStaffAccess } from "@/lib/suppressions/staff-access"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/suppressions/{id}/remove — soft-remove (Admin). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireSuppressionsStaffAccess(request, "POST")
  const { id: rawId } = await context.params
  const id = parseOrThrow(suppressionIdParamSchema, rawId)

  const removed = await removeSuppression(id, {
    userId: session.id,
    requestId: request.headers.get("x-request-id"),
  })

  return jsonForRole(session.role, removed)
}

export const POST = handler(handlePost)
