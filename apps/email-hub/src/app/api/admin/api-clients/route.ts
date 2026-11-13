import { getRequestId } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { createApiClientBodySchema } from "@/lib/api-clients/schemas"
import { createApiClient, listApiClients } from "@/lib/api-clients/service"
import { requireApiClientsStaffAccess } from "@/lib/api-clients/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** GET /api/admin/api-clients — list clients without secrets (Admin). */
async function handleGet(request: Request): Promise<Response> {
  await requireApiClientsStaffAccess(request)
  const body = await listApiClients()
  return Response.json(body)
}

/** POST /api/admin/api-clients — create a client; secret is returned once (Admin). */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireApiClientsStaffAccess(request)
  const body = parseOrThrow(
    createApiClientBodySchema,
    await parseJsonBody(request)
  )
  const created = await createApiClient(
    {
      name: body.name,
      scopes: body.scopes,
      ipAllowlist: body.ip_allowlist,
    },
    {
      userId: session.id,
      requestId: getRequestId() ?? null,
    }
  )
  return Response.json(created, { status: 201 })
}

export const GET = handler(handleGet)
export const POST = handler(handlePost)
