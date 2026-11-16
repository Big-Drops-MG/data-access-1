import { jsonForRole } from "@/lib/api-response"
import { handler } from "@/lib/handler"
import { recipientIdParamSchema } from "@/lib/recipients/schemas"
import { getRecipientDetail } from "@/lib/recipients/service"
import { requireRecipientsStaffAccess } from "@/lib/recipients/staff-access"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireRecipientsStaffAccess(request, "GET")
  const { id: rawId } = await context.params
  const id = parseOrThrow(recipientIdParamSchema, rawId)
  const result = await getRecipientDetail(id)
  return jsonForRole(session.role, result)
}

export const GET = handler(handleGet)
