import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import { requireMachineAuth } from "@/lib/auth/require-machine"
import { parseExtJsonBody, sendEmailBodySchema } from "@/lib/ext-emails/schemas"
import { submitExternalEmail } from "@/lib/ext-emails/service"
import { withApiRequest } from "@/lib/with-api-request"
import { parseOrThrow } from "@/lib/zod-parse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** POST /api/ext/emails/send — accept a send for the caller's API client. */
async function handlePost(request: Request): Promise<Response> {
  try {
    const { client, rawBody } = await requireMachineAuth(request, {
      scope: "emails:send",
    })
    const body = parseOrThrow(sendEmailBodySchema, parseExtJsonBody(rawBody))
    const result = await submitExternalEmail({
      apiClientId: client.id,
      to: body.to,
      emailType: body.email_type,
      idempotencyKey: body.idempotency_key,
      offerId: body.offer_id ?? null,
      externalUserId: body.external_user_id ?? null,
      mergeData: body.merge_data,
    })

    return Response.json(result.body, { status: result.httpStatus })
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

export const POST = withApiRequest(handlePost)
