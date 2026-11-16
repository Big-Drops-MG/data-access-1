import { getContextLogger } from "@workspace/logger"

import { handler } from "@/lib/handler"
import {
  importOfferBodySchema,
  offerListQuerySchema,
} from "@/lib/offers/schemas"
import { importOfferFromEverflow, listOffers } from "@/lib/offers/service"
import { requireOffersStaffAccess } from "@/lib/offers/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

async function handleGet(request: Request): Promise<Response> {
  await requireOffersStaffAccess(request, "GET")
  const url = new URL(request.url)
  const query = parseOrThrow(
    offerListQuerySchema,
    Object.fromEntries(url.searchParams.entries())
  )

  const result = await listOffers({
    limit: query.limit,
    status: query.status,
  })

  return Response.json(result)
}

/** POST /api/offers — import offer from Everflow by offer ID (Admin). */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireOffersStaffAccess(request, "POST")
  const body = parseOrThrow(importOfferBodySchema, await parseJsonBody(request))

  const created = await importOfferFromEverflow(body.everflow_offer_id, {
    userId: session.id,
    requestId: request.headers.get("x-request-id"),
  })

  getContextLogger().info(
    {
      event: "offer.imported",
      offer_id: created.id,
      everflow_offer_id: created.everflow_offer_id,
      user_id: session.id,
    },
    "Offer imported from Everflow"
  )

  return Response.json(created, { status: 201 })
}

export const GET = handler(handleGet)
export const POST = handler(handlePost)
