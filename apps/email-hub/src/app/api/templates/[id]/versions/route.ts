import {
  createTemplateVersionBodySchema,
  templateIdParamSchema,
} from "@/lib/templates/schemas"
import { createTemplateVersion } from "@/lib/templates/service"
import { requireTemplatesStaffAccess } from "@/lib/templates/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * POST /api/templates/{id}/versions — immutable version insert (Operator+).
 * Versions cannot be updated (no PATCH/PUT).
 */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireTemplatesStaffAccess(request, "POST")
  const { id } = await context.params
  const templateId = parseOrThrow(templateIdParamSchema, id)
  const body = parseOrThrow(
    createTemplateVersionBodySchema,
    await parseJsonBody(request)
  )

  const version = await createTemplateVersion(
    templateId,
    { subject: body.subject, bodySource: body.body_source },
    {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    }
  )

  return Response.json(version, { status: 201 })
}

export const POST = handler(handlePost)
