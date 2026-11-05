import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { createSendBodySchema, sendListQuerySchema } from "@/lib/sends/schemas"
import { createSend, listSends } from "@/lib/sends/service"
import { requireSendsStaffAccess } from "@/lib/sends/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** GET /api/sends — list (Viewer+). */
async function handleGet(request: Request): Promise<Response> {
  await requireSendsStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    sendListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listSends({
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
    emailType: query.email_type,
    offerId: query.offer_id,
    senderId: query.sender_id,
    categoryId: query.category_id,
    templateVersionId: query.template_version_id,
  })

  return Response.json(result)
}

/** POST /api/sends — create a draft send (Operator+). */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireSendsStaffAccess(request, "POST")
  const body = parseOrThrow(createSendBodySchema, await parseJsonBody(request))

  const created = await createSend(
    {
      templateVersionId: body.template_version_id,
      senderId: body.sender_id,
      categoryId: body.category_id,
      offerId: body.offer_id ?? null,
      scheduledFor: new Date(body.scheduled_for),
    },
    {
      userId: session.id,
      requestId: getRequestId(),
    }
  )

  return Response.json(created, { status: 201 })
}

export const GET = handler(handleGet)
export const POST = handler(handlePost)
