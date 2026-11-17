import { getContextLogger } from "@workspace/logger"

import { handler } from "@/lib/handler"
import { patchUnsubscribeSettingsBodySchema } from "@/lib/unsubscribe-admin/schemas"
import {
  getUnsubscribeSettings,
  patchUnsubscribeSettings,
} from "@/lib/unsubscribe-admin/settings-service"
import { requireUnsubscribeStaffAccess } from "@/lib/unsubscribe-admin/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

async function handleGet(request: Request): Promise<Response> {
  await requireUnsubscribeStaffAccess(request, "GET")
  return Response.json(await getUnsubscribeSettings())
}

async function handlePatch(request: Request): Promise<Response> {
  const session = await requireUnsubscribeStaffAccess(request, "PATCH")
  const body = parseOrThrow(
    patchUnsubscribeSettingsBodySchema,
    await parseJsonBody(request)
  )

  const updated = await patchUnsubscribeSettings(
    {
      logoUrl: body.logo_url,
      customDomain: body.custom_domain,
    },
    { userId: session.id }
  )

  getContextLogger().info(
    {
      event: "unsubscribe.settings.updated",
      user_id: session.id,
      custom_domain_status: updated.custom_domain_status,
    },
    "Unsubscribe settings updated"
  )

  return Response.json(updated)
}

export const GET = handler(handleGet)
export const PATCH = handler(handlePatch)
