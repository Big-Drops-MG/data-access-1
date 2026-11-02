import { headers } from "next/headers"

import { getAuth } from "./auth/server"
import { isSessionPastAbsoluteLimit } from "./auth/session-policy"

export type SessionUser = {
  id: string
  email: string
  name: string
  image: string | null
  /** Permission role (admin | operator | viewer). */
  role: "viewer" | "operator" | "admin"
  /** Display job title from onboarding; null until /onboarding is completed. */
  jobTitle: string | null
  twoFactorEnabled: boolean
}

function toSessionUser(user: {
  id: string
  email: string
  name: string
  image?: string | null
  role?: string | null
  jobTitle?: string | null
  twoFactorEnabled?: boolean | null
}): SessionUser | null {
  const role = user.role
  if (role !== "viewer" && role !== "operator" && role !== "admin") {
    return null
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    role,
    jobTitle: user.jobTitle ?? null,
    twoFactorEnabled: user.twoFactorEnabled === true,
  }
}

/** Current staff session, or null. Enforces 12 h absolute lifetime (SD#14.1). */
export async function getSession(): Promise<SessionUser | null> {
  const requestHeaders = await headers()
  const result = await getAuth().api.getSession({ headers: requestHeaders })
  if (!result?.session || !result.user) {
    return null
  }

  const createdAt = new Date(result.session.createdAt)
  if (isSessionPastAbsoluteLimit(createdAt)) {
    await getAuth().api.signOut({ headers: requestHeaders })
    return null
  }

  if (
    "status" in result.user &&
    result.user.status &&
    result.user.status !== "active"
  ) {
    await getAuth().api.signOut({ headers: requestHeaders })
    return null
  }

  return toSessionUser(result.user)
}

/** Delete the current session cookie / row (SD#14.1 sign out). */
export async function signOut(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() })
}

/** Delete all sessions for the current user (SD#14.1 sign out everywhere). */
export async function signOutEverywhere(): Promise<void> {
  const requestHeaders = await headers()
  await getAuth().api.revokeSessions({ headers: requestHeaders })
  await getAuth().api.signOut({ headers: requestHeaders })
}

export { getAuth } from "./auth/server"
