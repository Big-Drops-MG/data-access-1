import { AppError } from "@workspace/shared"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"
import {
  createDomainBodySchema,
  domainListQuerySchema,
} from "@/lib/domains/schemas"
import { createDomain, listDomains } from "@/lib/domains/service"
import { requireDomainsStaffAccess } from "@/lib/domains/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** GET /api/domains — list (Viewer+). */
export async function GET(request: Request) {
  try {
    await requireDomainsStaffAccess(request, "GET")
    const url = new URL(request.url)
    const query = parseOrThrow(
      domainListQuerySchema,
      Object.fromEntries(url.searchParams.entries())
    )

    const result = await listDomains({
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
    })

    return Response.json(result)
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}

/** POST /api/domains — create with SES identity + DNS (Admin). */
export async function POST(request: Request) {
  try {
    const session = await requireDomainsStaffAccess(request, "POST")
    const body = parseOrThrow(
      createDomainBodySchema,
      await parseJsonBody(request)
    )

    const created = await createDomain(body.name, {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    })

    return Response.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof AppError) {
      return jsonAppError(error)
    }
    return toErrorResponse(error)
  }
}
