import { redirect } from "next/navigation"

import { AppError } from "@workspace/shared"

import { getSession, type SessionUser } from "@/lib/auth"
import { buildLoginPath } from "@/lib/login/login-path"
import { hasAtLeastRole, type AppRole } from "@/lib/permissions"

/** Require an authenticated staff session (API). Throws 401. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession()
  if (!session) {
    throw AppError.unauthorized()
  }
  return session
}

/**
 * Require session with at least `minimum` role (API).
 * 401 when unauthenticated, 403 when role is too low (SD#14.3).
 */
export async function requireRole(minimum: AppRole): Promise<SessionUser> {
  const session = await requireSession()
  if (!hasAtLeastRole(session, minimum)) {
    throw AppError.forbidden()
  }
  return session
}

/**
 * Page / server-component guard (SD#14.3).
 * Unauthenticated → redirect to login. Under-privileged → `forbidden`.
 */
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
