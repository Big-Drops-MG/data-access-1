import {
  emailRouteIdParamSchema,
  updateEmailRouteBodySchema,
} from "@/lib/email-routes/schemas"
import { getEmailRoute, updateEmailRoute } from "@/lib/email-routes/service"
import { requireEmailRoutesStaffAccess } from "@/lib/email-routes/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

async function parseEmailRouteId(context: RouteContext): Promise<string> {
  const { id } = await context.params
  return parseOrThrow(emailRouteIdParamSchema, id)
}

/** GET /api/email-routes/{id} — detail (Viewer+). */
async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  await requireEmailRoutesStaffAccess(request, "GET")
  const id = await parseEmailRouteId(context)
  const detail = await getEmailRoute(id)
  return Response.json(detail)
}

/** PATCH /api/email-routes/{id} — edit the effective route (Operator+). */
async function handlePatch(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireEmailRoutesStaffAccess(request, "PATCH")
  const id = await parseEmailRouteId(context)
  const body = parseOrThrow(
    updateEmailRouteBodySchema,
    await parseJsonBody(request)
  )

  const updated = await updateEmailRoute(
    id,
    {
      version: body.version,
      emailType: body.email_type,
      offerId: body.offer_id,
      templateId: body.template_id,
      senderId: body.sender_id,
      status: body.status,
    },
    {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    }
  )

  return Response.json(updated)
}

export const GET = handler(handleGet)
export const PATCH = handler(handlePatch)
