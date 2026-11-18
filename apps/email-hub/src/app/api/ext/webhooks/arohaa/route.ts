import { getContextLogger, getRequestId } from "@workspace/logger"
import { AppError } from "@workspace/shared"

import { enqueueArohaaTierWebhook } from "@/lib/arohaa/enqueue"
import {
  arohaaWebhookBodySchema,
  parseArohaaJsonBody,
} from "@/lib/arohaa/schemas"
import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import { requireMachineAuth } from "@/lib/auth/require-machine"
import { withApiRequest } from "@/lib/with-api-request"
import { parseOrThrow } from "@/lib/zod-parse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handlePost(request: Request): Promise<Response> {
  try {
    const { rawBody } = await requireMachineAuth(request, {
      scope: "arohaa:webhook",
    })
    const body = parseOrThrow(
      arohaaWebhookBodySchema,
      parseArohaaJsonBody(rawBody)
    )

    const result = await enqueueArohaaTierWebhook({
      eventId: body.event_id,
      email: body.email,
      tier: body.tier,
      previousTier: body.previous_tier,
      occurredAt: body.occurred_at,
      requestId: getRequestId() ?? undefined,
    })

    getContextLogger().info(
      {
        event: "arohaa.webhook.accepted",
        arohaa_event_id: body.event_id,
        tier: body.tier,
        enqueue_result: result,
      },
      "Arohaa webhook accepted"
    )

    return Response.json({ status: "queued" }, { status: 202 })
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

export const POST = withApiRequest(handlePost)
