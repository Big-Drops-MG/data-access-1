import { NextResponse, type NextRequest } from "next/server"

import { resolveRequestId } from "@workspace/logger/request-id"

import { REQUEST_ID_COOKIE } from "@/lib/client-request-id"

/**
 * Forward the request path so server layouts can build a safe post-login `next=`.
 * Every matched response gets the same X-Request-Id that handlers read back.
 * Document responses may set a readable `eh-request-id` cookie once (SD#15.6);
 * API responses never Set-Cookie, and page responses only write when the value
 * changes — otherwise the App Router refreshes in a loop.
 */
export function proxy(request: NextRequest) {
  const existingCookie = request.cookies.get(REQUEST_ID_COOKIE)?.value
  // Prefer inbound header, then the existing cookie, so we do not mint a new id
  // (and Set-Cookie) on every navigation/RSC fetch.
  const requestId = resolveRequestId(
    request.headers.get("x-request-id") ?? existingCookie
  )
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-request-id", requestId)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const isApi = request.nextUrl.pathname.startsWith("/api")
  if (!isApi) {
    response.headers.set("x-pathname", request.nextUrl.pathname)
    // Set-Cookie on every response makes the App Router refetch forever.
    // Only write when the browser does not already have this id. Root layout
    // also exposes the id via <meta name="x-request-id"> for error pages.
    if (existingCookie !== requestId) {
      response.cookies.set(REQUEST_ID_COOKIE, requestId, {
        path: "/",
        sameSite: "lax",
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
      })
    }
  }
  response.headers.set("x-request-id", requestId)
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
