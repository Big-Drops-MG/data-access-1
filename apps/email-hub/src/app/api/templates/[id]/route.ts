import {
  templateIdParamSchema,
  updateTemplateBodySchema,
} from "@/lib/templates/schemas"
import { getTemplate, updateTemplate } from "@/lib/templates/service"
import { requireTemplatesStaffAccess } from "@/lib/templates/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

async function parseTemplateId(context: RouteContext): Promise<string> {
  const { id } = await context.params
  return parseOrThrow(templateIdParamSchema, id)
}

/** GET /api/templates/{id} — detail + versions (Viewer+). */
async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  await requireTemplatesStaffAccess(request, "GET")
  const id = await parseTemplateId(context)
  const detail = await getTemplate(id)
  return Response.json(detail)
}

/** PATCH /api/templates/{id} — name / category / status (Operator+). */
async function handlePatch(
  request: Request,
  context: RouteContext
): Promise<Response> {
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
}

export const GET = handler(handleGet)
export const PATCH = handler(handlePatch)
