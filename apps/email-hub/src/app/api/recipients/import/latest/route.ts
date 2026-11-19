import { jsonForRole } from "@/lib/api-response"
import { handler } from "@/lib/handler"
import { getLatestRecipientImport } from "@/lib/recipients/import-latest"
import { requireRecipientsStaffAccess } from "@/lib/recipients/staff-access"

async function handleGet(request: Request): Promise<Response> {
  const session = await requireRecipientsStaffAccess(request, "GET")
  const latest = await getLatestRecipientImport()
  return jsonForRole(session.role, { data: latest })
}

export const GET = handler(handleGet)
