import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import {
  templateIdParamSchema,
  updateTemplateBodySchema,
} from "@/lib/templates/schemas"
import { getTemplate, updateTemplate } from "@/lib/templates/service"
import { requireTemplatesStaffAccess } from "@/lib/templates/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

async function parseTemplateId(context: RouteContext): Promise<string> {
  const { id } = await context.params
  return parseOrThrow(templateIdParamSchema, id)
}

/** GET /api/templates/{id} — detail + versions (Viewer+). */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireTemplatesStaffAccess(request, "GET")
    const id = await parseTemplateId(context)
    const detail = await getTemplate(id)
    return Response.json(detail)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

/** PATCH /api/templates/{id} — name / category / status (Operator+). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireTemplatesStaffAccess(request, "PATCH")
    const id = await parseTemplateId(context)
    const body = parseOrThrow(
      updateTemplateBodySchema,
      await parseJsonBody(request)
    )

    const updated = await updateTemplate(
      id,
      {
        name: body.name,
        categoryId: body.category_id,
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
