import { handler } from "@/lib/handler"
import { getInboxPlacement } from "@/lib/reports/inbox-placement"
import { reportQuerySchema } from "@/lib/reports/schemas"
import { requireReportsStaffAccess } from "@/lib/reports/staff-access"
import { parseOrThrow } from "@/lib/zod-parse"

async function handleGet(request: Request): Promise<Response> {
  await requireReportsStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    reportQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )
  const result = await getInboxPlacement(query)
  return Response.json(result)
}

export const GET = handler(handleGet)
