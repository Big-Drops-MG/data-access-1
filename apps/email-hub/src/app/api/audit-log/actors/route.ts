import { listAuditActors } from "@/lib/audit-log/service"
import { requireAuditLogStaffAccess } from "@/lib/audit-log/staff-access"
import { jsonForRole } from "@/lib/api-response"
import { handler } from "@/lib/handler"

/** GET /api/audit-log/actors — actor picker options (Operator+). */
async function handleGet(request: Request): Promise<Response> {
  const session = await requireAuditLogStaffAccess(request, "GET")
  const result = await listAuditActors()
  return jsonForRole(session.role, result)
}

export const GET = handler(handleGet)
