import { handler } from "@/lib/handler"
import { everflowOfferIdParamSchema } from "@/lib/offers/schemas"
import { getOfferByEverflowId } from "@/lib/offers/service"
import { requireOffersStaffAccess } from "@/lib/offers/staff-access"
import { parseOrThrow } from "@/lib/zod-parse"

type RouteContext = {
  params: Promise<{ everflowOfferId: string }>
}

async function handleGet(
  request: Request,
  context: RouteContext
): Promise<Response> {
  await requireOffersStaffAccess(request, "GET")
  const params = await context.params
  const parsed = parseOrThrow(everflowOfferIdParamSchema, {
    everflow_offer_id: params.everflowOfferId,
  })

  const result = await getOfferByEverflowId(parsed.everflow_offer_id)
  return Response.json(result)
}

export const GET = handler(handleGet)
