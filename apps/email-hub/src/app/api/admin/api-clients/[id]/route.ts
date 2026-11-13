import { handler } from "@/lib/handler"
import { parseApiClientId } from "@/lib/api-clients/params"
import { getApiClient } from "@/lib/api-clients/service"
import { requireApiClientsStaffAccess } from "@/lib/api-clients/staff-access"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** GET /api/admin/api-clients/:id — client detail without secrets (Admin). */
async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  await requireApiClientsStaffAccess(request)
  const { id: rawId } = await context.params
  const client = await getApiClient(parseApiClientId(rawId))
  return Response.json(client)
}

export const GET = handler(handleGet)
