import { handler } from "@/lib/handler"
import { requireDashboardStaffAccess } from "@/lib/dashboard/staff-access"
import { getDashboardSummary } from "@/lib/dashboard/service"

async function handleGet(request: Request): Promise<Response> {
  await requireDashboardStaffAccess(request, "GET")
  const result = await getDashboardSummary()
  return Response.json(result)
}

export const GET = handler(handleGet)
