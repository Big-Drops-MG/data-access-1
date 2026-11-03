import { toErrorResponse } from "@/lib/api-response"
import { withApiRequest } from "@/lib/with-api-request"

/**
 * One route-handler wrapper (SD#15.6): request id + logging via
 * `withApiRequest`, and AppError / Zod / Postgres constraint / unknown
 * mapping to the SD#15.6 JSON body (never a stack trace).
 */
export function handler<Args extends unknown[]>(
  route: (request: Request, ...args: Args) => Response | Promise<Response>
): (request: Request, ...args: Args) => Promise<Response> {
  return withApiRequest(async (request, ...args) => {
    try {
      return await route(request, ...args)
    } catch (error) {
      return toErrorResponse(error)
    }
  })
}
