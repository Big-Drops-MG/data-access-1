import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { parseApiClientId } from "@/lib/api-clients/params"
import { updateApiClientAllowlistBodySchema } from "@/lib/api-clients/schemas"
import { updateApiClientAllowlist } from "@/lib/api-clients/service"
import { requireApiClientsStaffAccess } from "@/lib/api-clients/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** PATCH /api/admin/api-clients/:id/ip-allowlist — replace the IP allowlist (Admin). */
async function handlePatch(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireApiClientsStaffAccess(request)
  const { id: rawId } = await context.params
  const body = parseOrThrow(
    updateApiClientAllowlistBodySchema,
    await parseJsonBody(request)
  )
  const updated = await updateApiClientAllowlist(
    parseApiClientId(rawId),
    body.ip_allowlist,
    {
      userId: session.id,
      requestId: getRequestId() ?? null,
    }
  )
  return Response.json(updated)
}

export const PATCH = handler(handlePatch)
