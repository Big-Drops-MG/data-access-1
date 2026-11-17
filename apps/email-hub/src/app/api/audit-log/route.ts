import { auditLogListQuerySchema } from "@/lib/audit-log/schemas"
import { listAuditLog } from "@/lib/audit-log/service"
import { requireAuditLogStaffAccess } from "@/lib/audit-log/staff-access"
import { jsonForRole } from "@/lib/api-response"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

/** GET /api/audit-log — list audit entries (Operator+). */
async function handleGet(request: Request): Promise<Response> {
  const session = await requireAuditLogStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    auditLogListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listAuditLog({
    limit: query.limit,
    cursor: query.cursor,
    actorType: query.actor_type,
    actorId: query.actor_id,
    action: query.action,
    objectType: query.object_type,
    objectId: query.object_id,
    from: query.from,
    to: query.to,
  })

  return jsonForRole(session.role, result)
}

export const GET = handler(handleGet)
