import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import {
  createTemplateVersionBodySchema,
  templateIdParamSchema,
} from "@/lib/templates/schemas"
import { createTemplateVersion } from "@/lib/templates/service"
import { requireTemplatesStaffAccess } from "@/lib/templates/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * POST /api/templates/{id}/versions — immutable version insert (Operator+).
 * Versions cannot be updated (no PATCH/PUT).
 */
export async function POST(request: Request, context: RouteContext) {
  try {
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
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}
