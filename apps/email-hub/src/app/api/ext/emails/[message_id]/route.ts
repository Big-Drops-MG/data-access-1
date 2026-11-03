import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import { requireMachineAuth } from "@/lib/auth/require-machine"
import { getExternalEmailStatus } from "@/lib/ext-emails/service"
import { messageIdParamSchema } from "@/lib/ext-emails/schemas"
import { withApiRequest } from "@/lib/with-api-request"
import { parseOrThrow } from "@/lib/zod-parse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ message_id: string }>
}

/** GET /api/ext/emails/{message_id} — current persisted message status. */
async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const { client } = await requireMachineAuth(request, {
      scope: "emails:read",
    })
    const { message_id: rawId } = await context.params
    const messageId = parseOrThrow(
      messageIdParamSchema,
      decodeURIComponent(rawId)
    )
    const body = await getExternalEmailStatus(messageId, client.id)

    return Response.json(body)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

export const GET = withApiRequest(handleGet)
