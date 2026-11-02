import {
  WEB_SERVICE,
  createLogger,
  getContextLogger,
  resolveRequestId,
  runWithRequestContext,
} from "@workspace/logger"

import { logThrownRequestError } from "@/lib/request-error-log"

function requestPath(request: Request): string {
  try {
    return new URL(request.url).pathname
  } catch {
    return ""
  }
}

export function applyRequestId(
  response: Response,
  requestId: string
): Response {
  if (response.headers.get("x-request-id") === requestId) {
    return response
  }

  try {
    response.headers.set("x-request-id", requestId)
    return response
  } catch {
    const headers = new Headers(response.headers)
    headers.set("x-request-id", requestId)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

function logHttpRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number
): void {
  const fields = {
    event: "http.request",
    method,
    path,
    status,
    duration_ms: durationMs,
  }
  const logger = getContextLogger()
  if (status >= 500) {
    logger.error(fields, "HTTP request")
    return
  }
  if (status >= 400) {
    logger.warn(fields, "HTTP request")
    return
  }
  logger.info(fields, "HTTP request")
}

export async function observeApiRequest(
  request: Request,
  respond: () => Response | Promise<Response>
): Promise<Response> {
  const requestId = resolveRequestId(request.headers.get("x-request-id"))
  const started = Date.now()
  const path = requestPath(request)
  const logger = createLogger({ service: WEB_SERVICE })

  return runWithRequestContext(
    requestId,
    async () => {
      try {
        const response = await respond()
        const stamped = applyRequestId(response, requestId)
        logHttpRequest(
          request.method,
          path,
          stamped.status,
          Date.now() - started
        )
        return stamped
      } catch (error) {
        logThrownRequestError(error, request.method, path, Date.now() - started)
        throw error
      }
    },
    logger
  )
}

export function withApiRequest<Args extends unknown[], Result extends Response>(
  handler: (request: Request, ...args: Args) => Result | Promise<Result>
): (request: Request, ...args: Args) => Promise<Response> {
  return (request, ...args) =>
    observeApiRequest(request, () => handler(request, ...args))
}
