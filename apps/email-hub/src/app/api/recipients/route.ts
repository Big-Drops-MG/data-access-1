import { jsonForRole } from "@/lib/api-response"
import { handler } from "@/lib/handler"
import { recipientListQuerySchema } from "@/lib/recipients/schemas"
import { listRecipients } from "@/lib/recipients/service"
import { requireRecipientsStaffAccess } from "@/lib/recipients/staff-access"
import { parseOrThrow } from "@/lib/zod-parse"

async function handleGet(request: Request): Promise<Response> {
  const session = await requireRecipientsStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    recipientListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listRecipients({
    limit: query.limit,
    cursor: query.cursor,
    email: query.email,
    status: query.status,
    optedOutCategoryId: query.opted_out_category_id,
  })

  return jsonForRole(session.role, result)
}

export const GET = handler(handleGet)
