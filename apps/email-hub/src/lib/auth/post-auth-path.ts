import type { SessionUser } from "@/lib/auth"
import {
  DEFAULT_POST_LOGIN_PATH,
  safeNextPath,
} from "@/lib/login/safe-next-path"

/** After SSO/2FA: send users without a job title to /onboarding first. */
export function postAuthPath(
  session: Pick<SessionUser, "jobTitle">,
  next?: string | null
): string {
  if (!session.jobTitle) {
    return "/onboarding"
  }
  return safeNextPath(next, DEFAULT_POST_LOGIN_PATH)
}
