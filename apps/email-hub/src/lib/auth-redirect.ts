import { buildLoginPath } from "@/lib/login/login-path"

/**
 * SD#12.8 / T-031 — 401 responses send the user to login with a safe return path.
 */
export function loginRedirectPath(nextPath: string): string {
  return buildLoginPath({ next: nextPath })
}

export function redirectToLogin(nextPath: string): void {
  if (typeof window === "undefined") {
    return
  }
  window.location.assign(loginRedirectPath(nextPath))
}
