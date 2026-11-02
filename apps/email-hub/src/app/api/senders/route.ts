import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import {
  createSenderBodySchema,
  senderListQuerySchema,
} from "@/lib/senders/schemas"
import { createSender, listSenders } from "@/lib/senders/service"
import { requireSendersStaffAccess } from "@/lib/senders/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** GET /api/senders — list (Viewer+). */
export async function GET(request: Request) {
  try {
    await requireSendersStaffAccess(request, "GET")
    const url = new URL(request.url)
    const query = parseOrThrow(
      senderListQuerySchema,
      Object.fromEntries(url.searchParams.entries())
    )

    const result = await listSenders({
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
      domainId: query.domain_id,
    })

    return Response.json(result)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

/** POST /api/senders — create on a verified domain (Operator+). */
export async function POST(request: Request) {
  try {
    const session = await requireSendersStaffAccess(request, "POST")
    const body = parseOrThrow(
      createSenderBodySchema,
      await parseJsonBody(request)
    )

    const created = await createSender(
      {
        domainId: body.domain_id,
        fromName: body.from_name,
        localPart: body.local_part,
        replyTo: body.reply_to,
      },
      {
        userId: session.id,
        requestId: request.headers.get("x-request-id"),
      }
    )

    return Response.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}
