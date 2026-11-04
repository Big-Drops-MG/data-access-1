import { getContextLogger } from "@workspace/logger"

import {
  createTemplateBodySchema,
  templateListQuerySchema,
} from "@/lib/templates/schemas"
import { createTemplate, listTemplates } from "@/lib/templates/service"
import { requireTemplatesStaffAccess } from "@/lib/templates/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** GET /api/templates — list (Viewer+). */
async function handleGet(request: Request): Promise<Response> {
  await requireTemplatesStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    templateListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listTemplates({
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
    emailType: query.email_type,
    categoryId: query.category_id,
  })

  return Response.json(result)
}

/** POST /api/templates — create draft (Operator+). */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireTemplatesStaffAccess(request, "POST")
  const body = parseOrThrow(
    createTemplateBodySchema,
    await parseJsonBody(request)
  )

  const created = await createTemplate(
    {
      name: body.name,
      categoryId: body.category_id,
      emailType: body.email_type,
    },
    {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    }
  )

  getContextLogger().info(
    {
      event: "template.created",
      template_id: created.id,
      user_id: session.id,
    },
    "Template created"
  )

  return Response.json(created, { status: 201 })
}

export const GET = handler(handleGet)
export const POST = handler(handlePost)
