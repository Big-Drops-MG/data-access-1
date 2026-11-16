import { handler } from "@/lib/handler"
import { reportQuerySchema } from "@/lib/reports/schemas"
import { getReport, parseReportName } from "@/lib/reports/service"
import { requireReportsStaffAccess } from "@/lib/reports/staff-access"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ name: string }>
}

async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  await requireReportsStaffAccess(request, "GET")
  const { name: rawName } = await context.params
  const name = parseReportName(rawName)
  const url = new URL(request.url)
  const query = parseOrThrow(
    reportQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )
  const result = await getReport(name, query)
  return Response.json(result)
}

export const GET = handler(handleGet)
