import {
  senderIdParamSchema,
  updateSenderBodySchema,
} from "@/lib/senders/schemas"
import { getSender, updateSender } from "@/lib/senders/service"
import { requireSendersStaffAccess } from "@/lib/senders/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

async function parseSenderId(context: RouteContext): Promise<string> {
  const { id } = await context.params
  return parseOrThrow(senderIdParamSchema, id)
}

/** GET /api/senders/{id} — detail (Viewer+). */
async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  await requireSendersStaffAccess(request, "GET")
  const id = await parseSenderId(context)
  const detail = await getSender(id)
  return Response.json(detail)
}

/** PATCH /api/senders/{id} — edit with version lock (Operator+). */
async function handlePatch(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireSendersStaffAccess(request, "PATCH")
  const id = await parseSenderId(context)
  const body = parseOrThrow(
    updateSenderBodySchema,
    await parseJsonBody(request)
  )

  const updated = await updateSender(
    id,
    {
      version: body.version,
      fromName: body.from_name,
      localPart: body.local_part,
      replyTo: body.reply_to,
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
