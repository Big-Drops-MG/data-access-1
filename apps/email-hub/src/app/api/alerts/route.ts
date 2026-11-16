import { jsonForRole } from "@/lib/api-response"
import { requireAlertsStaffAccess } from "@/lib/alerts/staff-access"
import { alertListQuerySchema } from "@/lib/alerts/schemas"
import { listAlerts } from "@/lib/alerts/service"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

/** GET /api/alerts — list alerts (Operator+). */
async function handleGet(request: Request): Promise<Response> {
  const session = await requireAlertsStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    alertListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listAlerts({
    limit: query.limit,
    cursor: query.cursor,
    status: query.status,
    severity: query.severity,
    type: query.type,
  })

  return jsonForRole(session.role, result)
}

export const GET = handler(handleGet)
