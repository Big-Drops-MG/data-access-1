import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import { domainRefSchema } from "@/lib/domains/schemas"
import { checkDomainDns } from "@/lib/domains/service"
import { requireDomainsStaffAccess } from "@/lib/domains/staff-access"
import { withApiRequest } from "@/lib/with-api-request"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** POST /api/domains/{id|fqdn}/check — re-resolve DNS and refresh status (Admin). */
async function handlePost(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const session = await requireDomainsStaffAccess(request, "POST")
    const { id: rawRef } = await context.params
    const ref = parseOrThrow(domainRefSchema, decodeURIComponent(rawRef))

    const detail = await checkDomainDns(ref, {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    })

    return Response.json(detail)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

export const POST = withApiRequest(handlePost)
