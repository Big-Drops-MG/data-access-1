import { handler } from "@/lib/handler"
import { offerListQuerySchema } from "@/lib/offers/schemas"
import { listOffers } from "@/lib/offers/service"
import { requireOffersStaffAccess } from "@/lib/offers/staff-access"
import { parseOrThrow } from "@/lib/zod-parse"

/** GET /api/offers — list offers, active by default (Viewer+). */
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

export const GET = handler(handleGet)
