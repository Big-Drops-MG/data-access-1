import { getContextLogger } from "@workspace/logger"

import {
  createDomainBodySchema,
  domainListQuerySchema,
} from "@/lib/domains/schemas"
import { createDomain, listDomains } from "@/lib/domains/service"
import { requireDomainsStaffAccess } from "@/lib/domains/staff-access"
import { handler } from "@/lib/handler"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

/** GET /api/domains — list (Viewer+). */
async function handleGet(request: Request): Promise<Response> {
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
}

/** POST /api/domains — create with SES identity + DNS (Admin). */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireDomainsStaffAccess(request, "POST")
  const body = parseOrThrow(
    createDomainBodySchema,
    await parseJsonBody(request)
  )

  const created = await createDomain(
    {
      name: body.name,
      mailFromSubdomain: body.mail_from_subdomain,
    },
    {
      userId: session.id,
      requestId: request.headers.get("x-request-id"),
    }
  )

  getContextLogger().info(
    {
      event: "domain.created",
      domain_id: created.id,
      user_id: session.id,
    },
    "Domain created"
  )

  return Response.json(created, { status: 201 })
}

export const GET = handler(handleGet)
export const POST = handler(handlePost)
