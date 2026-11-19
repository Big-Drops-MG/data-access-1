import { redirect } from "next/navigation"

import { AppError } from "@workspace/shared"

import { getSession, type SessionUser } from "@/lib/auth"
import { consumeStaffRateLimitFromEnv } from "@/lib/auth/staff-rate-limit"
import { buildLoginPath } from "@/lib/login/login-path"
import { hasAtLeastRole, type AppRole } from "@/lib/permissions"
import type { RateLimitResult } from "@/lib/rate-limit/sliding-window-redis"

export type RequireRoleOptions = {
  consumeStaffRateLimit?: (userId: string) => Promise<RateLimitResult>
}

function applyStaffRateLimit(result: RateLimitResult): void {
  if (result === "limited") {
    throw AppError.rateLimited([
      { path: "rate_limit", message: "Too many requests for this user" },
    ])
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) {
    throw AppError.unauthorized()
  }
  return session
}

export async function requireRole(
  minimum: AppRole,
  options?: RequireRoleOptions
): Promise<SessionUser> {
  const session = await requireSession()
  if (!hasAtLeastRole(session, minimum)) {
    throw AppError.forbidden()
  }
  const consume = options?.consumeStaffRateLimit ?? consumeStaffRateLimitFromEnv
  applyStaffRateLimit(await consume(session.id))
  return session
}

export async function requireRoleForPage(
  minimum: AppRole,
  options?: { nextPath?: string }
): Promise<{ user: SessionUser } | { forbidden: true }> {
  const session = await getSession()
  if (!session) {
    redirect(buildLoginPath({ next: options?.nextPath }))
  }
  if (!hasAtLeastRole(session, minimum)) {
    return { forbidden: true }
  }
  return { user: session }
}
