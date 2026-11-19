import { NextResponse } from "next/server"

import { authorizeE2eRequest } from "@/lib/e2e/guard"
import {
  challengeCookiesFor,
  clearPersonaRateLimit,
  expirePersonaLockout,
  resetE2ePersonas,
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
    body = {}
  }
  const action =
    typeof body === "object" && body !== null && "action" in body
      ? body.action
      : "reset"
  const persona =
    typeof body === "object" && body !== null && "persona" in body
      ? body.persona
      : undefined

  if (action === "reset") {
    await resetE2ePersonas()
    return NextResponse.json({ ok: true })
  }
  if (!isE2ePersona(persona)) {
    return notFound()
  }
  if (action === "clear-rate-limit") {
    await clearPersonaRateLimit(persona)
    return NextResponse.json({ ok: true })
  }
  if (action === "expire-lockout") {
    await expirePersonaLockout(persona)
    const response = NextResponse.json({ ok: true })
    applyCookies(response, await challengeCookiesFor(persona))
    return response
  }
  return notFound()
}
