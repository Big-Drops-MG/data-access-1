import { emailRouteIdParamSchema } from "@/lib/email-routes/schemas"
import { archiveEmailRoute } from "@/lib/email-routes/service"
import { requireEmailRoutesStaffAccess } from "@/lib/email-routes/staff-access"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/email-routes/{id}/archive — mark inactive (Operator+). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireEmailRoutesStaffAccess(request, "POST")
  const { id: rawId } = await context.params
  const id = parseOrThrow(emailRouteIdParamSchema, rawId)

  const archived = await archiveEmailRoute(id, {
    userId: session.id,
    requestId: request.headers.get("x-request-id"),
  })

  return Response.json(archived)
}

export const POST = handler(handlePost)
