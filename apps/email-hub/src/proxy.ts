import { NextResponse, type NextRequest } from "next/server"

import { resolveRequestId } from "@workspace/logger/request-id"

/**
 * Forward the request path so server layouts can build a safe post-login `next=`.
 * Every matched response gets the same X-Request-Id that handlers read back.
 */
export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get("x-request-id"))
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-request-id", requestId)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  if (!request.nextUrl.pathname.startsWith("/api")) {
    response.headers.set("x-pathname", request.nextUrl.pathname)
  }
  response.headers.set("x-request-id", requestId)
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
