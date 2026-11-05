import { jsonForRole } from "@/lib/api-response"
import { handler } from "@/lib/handler"
import {
  createSuppressionBodySchema,
  suppressionListQuerySchema,
} from "@/lib/suppressions/schemas"
import {
  addManualSuppression,
  listSuppressions,
} from "@/lib/suppressions/service"
import { requireSuppressionsStaffAccess } from "@/lib/suppressions/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** GET /api/suppressions — list suppressions (Viewer+). */
async function handleGet(request: Request): Promise<Response> {
  const session = await requireSuppressionsStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    suppressionListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listSuppressions({
    limit: query.limit,
    cursor: query.cursor,
    source: query.source,
    scope: query.scope,
    offerId: query.offer_id,
    email: query.email,
    includeRemoved: query.include_removed === "true",
  })

  return jsonForRole(session.role, result)
}

/** POST /api/suppressions — manual suppression (Operator+). */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireSuppressionsStaffAccess(request, "POST")
  const body = parseOrThrow(
    createSuppressionBodySchema,
    await parseJsonBody(request)
  )

  const result = await addManualSuppression(
    {
      email: body.email,
      offerId: body.offer_id ?? null,
    },
    {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    }
  )

  return jsonForRole(session.role, result, {
    status: result.created ? 201 : 200,
  })
}

export const GET = handler(handleGet)
export const POST = handler(handlePost)
