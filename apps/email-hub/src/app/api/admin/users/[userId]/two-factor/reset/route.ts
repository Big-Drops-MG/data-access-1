import { NextResponse } from "next/server"

import { getSession } from "@/lib/auth"
import { logAuthEvent } from "@/lib/auth/auth-events"
import { resetTwoFactorForAdmin } from "@/lib/auth/two-factor-lockout"
import { canManageUsers } from "@/lib/permissions"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RouteContext = {
  params: Promise<{ userId: string }>
}

/** Admin-only 2FA reset (SD#9.11 / T-030). */
export async function POST(_request: Request, context: RouteContext) {
  const session = await getSession()
  if (!canManageUsers(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { userId } = await context.params
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "invalid_user_id" }, { status: 400 })
  }

  await resetTwoFactorForAdmin(userId)
  logAuthEvent("auth.2fa_reset", {
    user_id: userId,
    admin_user_id: session!.id,
  })

  return NextResponse.json({ ok: true })
}
