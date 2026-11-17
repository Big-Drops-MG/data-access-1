import { listUnsubscribeOptOuts } from "@/lib/unsubscribe-admin/opt-outs-service"
import { optOutListQuerySchema } from "@/lib/unsubscribe-admin/schemas"
import { requireUnsubscribeStaffAccess } from "@/lib/unsubscribe-admin/staff-access"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

async function handleGet(request: Request): Promise<Response> {
  await requireUnsubscribeStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    optOutListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listUnsubscribeOptOuts({
    limit: query.limit,
    cursor: query.cursor,
    q: query.q,
    scope: query.scope,
  })

  return Response.json(result)
}

export const GET = handler(handleGet)
