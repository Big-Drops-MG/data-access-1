import { listEmailCategories } from "@/lib/email-categories/service"
import { requireEmailCategoriesStaffAccess } from "@/lib/email-categories/staff-access"
import { handler } from "@/lib/handler"

/** GET /api/email-categories — active categories (Viewer+). */
async function handleGet(request: Request): Promise<Response> {
  await requireEmailCategoriesStaffAccess(request, "GET")
  const result = await listEmailCategories()
  return Response.json(result)
}

export const GET = handler(handleGet)
