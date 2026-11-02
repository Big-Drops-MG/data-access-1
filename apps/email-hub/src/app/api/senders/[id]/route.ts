import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import {
  senderIdParamSchema,
  updateSenderBodySchema,
} from "@/lib/senders/schemas"
import { getSender, updateSender } from "@/lib/senders/service"
import { requireSendersStaffAccess } from "@/lib/senders/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

async function parseSenderId(context: RouteContext): Promise<string> {
  const { id } = await context.params
  return parseOrThrow(senderIdParamSchema, id)
}

/** GET /api/senders/{id} — detail (Viewer+). */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireSendersStaffAccess(request, "GET")
    const id = await parseSenderId(context)
    const detail = await getSender(id)
    return Response.json(detail)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

/** PATCH /api/senders/{id} — edit with version lock (Operator+). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
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
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}
