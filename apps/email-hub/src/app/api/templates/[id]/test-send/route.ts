import {
  templateIdParamSchema,
  testSendTemplateBodySchema,
} from "@/lib/templates/schemas"
import { sendTemplateTest } from "@/lib/templates/test-send"
import { requireTemplatesStaffAccess } from "@/lib/templates/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

export const runtime = "nodejs"

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * POST /api/templates/{id}/test-send — queue a test message to the
 * authenticated user with environment=test.
 */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireTemplatesStaffAccess(request, "POST")
  const { id } = await context.params
  const templateId = parseOrThrow(templateIdParamSchema, id)
  const body = parseOrThrow(
    testSendTemplateBodySchema,
    await parseJsonBody(request)
  )

  const result = await sendTemplateTest(
    {
      templateId,
      versionId: body.version_id,
      offerId: body.offer_id ?? null,
      idempotencyKey: body.idempotency_key,
      mergeData: body.merge_data,
      email: session.email,
    },
    {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    }
  )

  return Response.json(
    {
      message_id: result.message_id,
      status: result.status,
      environment: result.environment,
    },
    { status: result.httpStatus }
  )
}

export const POST = handler(handlePost)
