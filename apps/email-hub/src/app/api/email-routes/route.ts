import {
  createEmailRouteBodySchema,
  emailRouteListQuerySchema,
} from "@/lib/email-routes/schemas"
import { createEmailRoute, listEmailRoutes } from "@/lib/email-routes/service"
import { requireEmailRoutesStaffAccess } from "@/lib/email-routes/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** GET /api/email-routes — list (Viewer+). */
async function handleGet(request: Request): Promise<Response> {
  await requireEmailRoutesStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    emailRouteListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listEmailRoutes({
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
    emailType: query.email_type,
    offerId: query.offer_id,
    templateId: query.template_id,
    senderId: query.sender_id,
  })

  return Response.json(result)
}

/** POST /api/email-routes — create an active route (Operator+). */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireEmailRoutesStaffAccess(request, "POST")
  const body = parseOrThrow(
    createEmailRouteBodySchema,
    await parseJsonBody(request)
  )

  const created = await createEmailRoute(
    {
      emailType: body.email_type,
      offerId: body.offer_id ?? null,
      templateId: body.template_id,
      senderId: body.sender_id,
    },
    {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    }
  )

  return Response.json(created, { status: 201 })
}

export const GET = handler(handleGet)
export const POST = handler(handlePost)
