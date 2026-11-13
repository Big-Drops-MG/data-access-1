import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { parseApiClientId } from "@/lib/api-clients/params"
import { updateApiClientScopesBodySchema } from "@/lib/api-clients/schemas"
import { updateApiClientScopes } from "@/lib/api-clients/service"
import { requireApiClientsStaffAccess } from "@/lib/api-clients/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** PATCH /api/admin/api-clients/:id/scopes — replace scopes (Admin). */
async function handlePatch(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireApiClientsStaffAccess(request)
  const { id: rawId } = await context.params
  const body = parseOrThrow(
    updateApiClientScopesBodySchema,
    await parseJsonBody(request)
  )
  const updated = await updateApiClientScopes(
    parseApiClientId(rawId),
    body.scopes,
    {
      userId: session.id,
      requestId: getRequestId() ?? null,
    }
  )
  return Response.json(updated)
}

export const PATCH = handler(handlePatch)
