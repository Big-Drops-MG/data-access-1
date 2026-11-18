import { NextResponse, type NextRequest } from "next/server"

import { resolveRequestId } from "@workspace/logger/request-id"
import { AppError, isAppError } from "@workspace/shared"

import { REQUEST_ID_COOKIE } from "@/lib/client-request-id"
import { createCspNonce } from "@/lib/security/csp-nonce"
import {
  assertStaffRequestOrigin,
  resolveAppOrigin,
  shouldRejectStaffOriginInProxy,
} from "@/lib/security/origin-check"
import {
  applySecurityHeaders,
  buildSecurityHeaders,
  CSP_NONCE_HEADER,
} from "@/lib/security/security-headers"

export function proxy(request: NextRequest) {
  const existingCookie = request.cookies.get(REQUEST_ID_COOKIE)?.value
  const requestId = resolveRequestId(
    request.headers.get("x-request-id") ?? existingCookie
  )
  const nonce = createCspNonce()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-request-id", requestId)
  requestHeaders.set(CSP_NONCE_HEADER, nonce)

  const pathname = request.nextUrl.pathname
  if (shouldRejectStaffOriginInProxy(request.method, pathname)) {
    try {
      assertStaffRequestOrigin(request, {
        appOrigin: resolveAppOrigin(),
        strict: true,
      })
    } catch (error) {
      const appError = isAppError(error)
        ? error
        : AppError.forbidden([
            {
              path: "origin",
              message: "Origin header must match the application origin",
            },
          ])
      const rejected = NextResponse.json(appError.toJSON(), {
        status: appError.status,
      })
      rejected.headers.set("x-request-id", requestId)
      applySecurityHeaders(
        rejected.headers,
        buildSecurityHeaders(nonce, {
          sentryDsn: process.env.SENTRY_DSN,
          includeHsts: request.nextUrl.protocol === "https:",
        })
      )
      return rejected
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  const isApi = pathname.startsWith("/api")
  if (!isApi) {
    response.headers.set("x-pathname", pathname)
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
  applySecurityHeaders(
    response.headers,
    buildSecurityHeaders(nonce, {
      sentryDsn: process.env.SENTRY_DSN,
      includeHsts: request.nextUrl.protocol === "https:",
    })
  )
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
