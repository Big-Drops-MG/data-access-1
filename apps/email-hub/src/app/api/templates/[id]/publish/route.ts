import {
  publishTemplateBodySchema,
  templateIdParamSchema,
} from "@/lib/templates/schemas"
import { publishTemplateVersion } from "@/lib/templates/service"
import { requireTemplatesStaffAccess } from "@/lib/templates/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * POST /api/templates/{id}/publish — set current_version_id in one transaction.
 */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireTemplatesStaffAccess(request, "POST")
  const { id } = await context.params
  const templateId = parseOrThrow(templateIdParamSchema, id)
  const body = parseOrThrow(
    publishTemplateBodySchema,
    await parseJsonBody(request)
  )

  const published = await publishTemplateVersion(templateId, body.version_id, {
    userId: session.id,
    requestId: request.headers.get("x-request-id"),
  })

  return Response.json(published)
}

export const POST = handler(handlePost)
