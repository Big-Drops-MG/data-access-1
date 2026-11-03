import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import { domainRefSchema, updateDomainBodySchema } from "@/lib/domains/schemas"
import {
  deleteDomain,
  getDomain,
  updateDomainStatus,
} from "@/lib/domains/service"
import { requireDomainsStaffAccess } from "@/lib/domains/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ id: string }>
}

/** GET /api/domains/{id|fqdn} — detail with DNS + setup steps (Viewer+). */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireDomainsStaffAccess(request, "GET")
    const { id: rawRef } = await context.params
    const ref = parseOrThrow(domainRefSchema, decodeURIComponent(rawRef))
    const detail = await getDomain(ref)
    return Response.json(detail)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

/** PATCH /api/domains/{id|fqdn} — status change (Admin). */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireDomainsStaffAccess(request, "PATCH")
    const { id: rawRef } = await context.params
    const ref = parseOrThrow(domainRefSchema, decodeURIComponent(rawRef))
    const body = parseOrThrow(
      updateDomainBodySchema,
      await parseJsonBody(request)
    )

    const updated = await updateDomainStatus(ref, body.status, {
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

/** DELETE /api/domains/{id|fqdn} — remove SES identity + domain row (Admin). */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireDomainsStaffAccess(request, "DELETE")
    const { id: rawRef } = await context.params
    const ref = parseOrThrow(domainRefSchema, decodeURIComponent(rawRef))

    const result = await deleteDomain(ref, {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    })

    return Response.json(result)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}
