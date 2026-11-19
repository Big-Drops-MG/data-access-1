import { NextResponse } from "next/server"

import { authorizeE2eRequest } from "@/lib/e2e/guard"
import {
  challengeCookiesFor,
  sessionCookiesFor,
  type E2eCookie,
} from "@/lib/e2e/fixtures"
import { isE2ePersona } from "@/lib/e2e/personas"

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 })
}

function applyCookies(response: NextResponse, cookies: E2eCookie[]): void {
  for (const cookie of cookies) {
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: cookie.maxAge,
    })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorizeE2eRequest(request)) {
    return notFound()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return notFound()
  }
  const persona =
    typeof body === "object" && body !== null && "persona" in body
      ? body.persona
      : undefined
  if (!isE2ePersona(persona)) {
    return notFound()
  }

  const cookies =
    persona === "login"
      ? await sessionCookiesFor(persona)
      : await challengeCookiesFor(persona)
  const response = NextResponse.json({ ok: true })
  applyCookies(response, cookies)
  return response
}
