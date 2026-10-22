/**
 * SD#12.8 — 401 responses send the user to login with a return path.
 */
export function loginRedirectPath(nextPath: string): string {
  const path = nextPath.startsWith("/") ? nextPath : `/${nextPath}`
  return `/login?next=${encodeURIComponent(path)}`
}

export function redirectToLogin(nextPath: string): void {
  if (typeof window === "undefined") {
    return
  }
  window.location.assign(loginRedirectPath(nextPath))
}
