import { NextResponse, type NextRequest } from "next/server"

/**
 * Forward the request path so server layouts can build a safe post-login `next=`.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set("x-pathname", request.nextUrl.pathname)
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)"],
}
