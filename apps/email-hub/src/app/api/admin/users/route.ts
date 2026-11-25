import { handler } from "@/lib/handler"
import { listUsers } from "@/lib/users/service"
import { requireUsersStaffAccess } from "@/lib/users/staff-access"

/** GET /api/admin/users — list staff users and pending invitations (Admin). */
async function handleGet(request: Request): Promise<Response> {
  await requireUsersStaffAccess(request)
  const users = await listUsers()
  return Response.json({ users })
}

export const GET = handler(handleGet)
