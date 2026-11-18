import { domainRefSchema } from "@/lib/domains/schemas"
import { enqueueDomainDnsCheck } from "@/lib/domains/service"
import { requireDomainsStaffAccess } from "@/lib/domains/staff-access"
import { handler } from "@/lib/handler"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/domains/{id|fqdn}/check — enqueue dns-check (Admin). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  const session = await requireDomainsStaffAccess(request, "POST")
  const { id: rawRef } = await context.params
  const ref = parseOrThrow(domainRefSchema, decodeURIComponent(rawRef))

  const queued = await enqueueDomainDnsCheck(ref, {
    userId: session.id,
    requestId: request.headers.get("x-request-id"),
  })

  return Response.json(queued, { status: 202 })
}

export const POST = handler(handlePost)
