import { getContextLogger } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { verifyUnsubscribeCustomDomain } from "@/lib/unsubscribe-admin/settings-service"
import { requireUnsubscribeStaffAccess } from "@/lib/unsubscribe-admin/staff-access"

async function handlePost(request: Request): Promise<Response> {
  const session = await requireUnsubscribeStaffAccess(request, "POST")
  const updated = await verifyUnsubscribeCustomDomain()

  getContextLogger().info(
    {
      event: "unsubscribe.custom_domain.verified",
      user_id: session.id,
      custom_domain_status: updated.custom_domain_status,
      custom_domain: updated.custom_domain,
    },
    "Unsubscribe custom domain verification attempted"
  )

  return Response.json(updated)
}

export const POST = handler(handlePost)
