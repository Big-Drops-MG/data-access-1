import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import {
  deleteSendQuerySchema,
  sendIdParamSchema,
  updateSendBodySchema,
} from "@/lib/sends/schemas"
import { deleteSend, getSend, updateSend } from "@/lib/sends/service"
import { requireSendsStaffAccess } from "@/lib/sends/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

async function parseSendId(context: RouteContext): Promise<string> {
  const { id } = await context.params
  return parseOrThrow(sendIdParamSchema, id)
}

/** GET /api/sends/{id} — detail (Viewer+). */
async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  await requireSendsStaffAccess(request, "GET")
  const id = await parseSendId(context)
  const detail = await getSend(id)
  return Response.json(detail)
}

/** PATCH /api/sends/{id} — edit a draft (Operator+). */
async function handlePatch(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireSendsStaffAccess(request, "PATCH")
  const id = await parseSendId(context)
  const body = parseOrThrow(updateSendBodySchema, await parseJsonBody(request))

  const updated = await updateSend(
    id,
    {
      version: body.version,
      templateVersionId: body.template_version_id,
      senderId: body.sender_id,
      categoryId: body.category_id,
      offerId: body.offer_id,
      scheduledFor: body.scheduled_for
        ? new Date(body.scheduled_for)
        : undefined,
    },
    {
      userId: session.id,
      requestId: getRequestId(),
    }
  )

  return Response.json(updated)
}

/** DELETE /api/sends/{id}?version= — delete a draft (Operator+). */
async function handleDelete(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireSendsStaffAccess(request, "DELETE")
  const id = await parseSendId(context)
  const url = new URL(request.url)
  const query = parseOrThrow(
    deleteSendQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const deleted = await deleteSend(id, query.version, {
    userId: session.id,
    requestId: getRequestId(),
  })

  return Response.json(deleted)
}

export const GET = handler(handleGet)
export const PATCH = handler(handlePatch)
export const DELETE = handler(handleDelete)
