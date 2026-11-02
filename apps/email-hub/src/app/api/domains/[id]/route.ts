import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import {
  domainIdParamSchema,
  updateDomainBodySchema,
} from "@/lib/domains/schemas"
import { getDomain, updateDomainStatus } from "@/lib/domains/service"
import { requireDomainsStaffAccess } from "@/lib/domains/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** GET /api/domains/{id} — detail with DNS + setup steps (Viewer+). */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireDomainsStaffAccess(request, "GET")
    const { id: rawId } = await context.params
    const id = parseOrThrow(domainIdParamSchema, rawId)
    const detail = await getDomain(id)
    return Response.json(detail)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

/** PATCH /api/domains/{id} — status change (Admin). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireDomainsStaffAccess(request, "PATCH")
    const { id: rawId } = await context.params
    const id = parseOrThrow(domainIdParamSchema, rawId)
    const body = parseOrThrow(
      updateDomainBodySchema,
      await parseJsonBody(request)
    )

    const updated = await updateDomainStatus(id, body.status, {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    })

    return Response.json(updated)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}
