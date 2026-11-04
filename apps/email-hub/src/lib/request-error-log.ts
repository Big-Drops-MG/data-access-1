import { getContextLogger, resolveRequestId } from "@workspace/logger"

const LOGGED_ERROR = Symbol.for("emailhub.requestErrorLogged")

function markLogged(error: unknown): void {
  if (typeof error === "object" && error !== null) {
    Object.defineProperty(error, LOGGED_ERROR, { value: true })
  }
}

export function wasRequestErrorLogged(error: unknown): boolean {
  return typeof error === "object" && error !== null && LOGGED_ERROR in error
}

type RequestErrorInfo = {
  path: string
  method: string
  headers: Record<string, string | string[] | undefined>
}

function headerValue(
  headers: RequestErrorInfo["headers"],
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

function requestPath(path: string): string {
  const query = path.indexOf("?")
  return query === -1 ? path : path.slice(0, query)
}

export function logThrownRequestError(
  error: unknown,
  method: string,
  path: string,
  durationMs: number
): void {
  if (wasRequestErrorLogged(error)) {
    return
  }
  markLogged(error)
  getContextLogger().error(
    {
      event: "http.unhandled_error",
      method,
      path,
      duration_ms: durationMs,
      err: error,
    },
    "Unhandled request error"
  )
}

export function logUnhandledRequestError(
  error: unknown,
  request: RequestErrorInfo
): void {
  if (wasRequestErrorLogged(error)) {
    return
  }
  markLogged(error)
  const requestId = resolveRequestId(
    headerValue(request.headers, "x-request-id")
  )
  getContextLogger()
    .child({ request_id: requestId })
    .error(
      {
        event: "http.unhandled_error",
        method: request.method,
        path: requestPath(request.path),
        err: error,
      },
      "Unhandled request error"
    )
}
