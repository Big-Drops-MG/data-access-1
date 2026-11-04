import { DEFAULT_POST_LOGIN_PATH, safeNextPath } from "./safe-next-path"

type LoginPathOptions = {
  next?: string | null
  error?: string | null
}

/**
 * Build a `/login` URL with optional sanitised `next` and `error` query.
 * Default post-login path (`/dashboard`) is omitted — login already falls back to it.
 */
export function buildLoginPath({ next, error }: LoginPathOptions = {}): string {
  const params = new URLSearchParams()
  const safeNext = safeNextPath(next)
  if (safeNext !== DEFAULT_POST_LOGIN_PATH) {
    params.set("next", safeNext)
  }
  if (error != null && error.trim() !== "") {
    params.set("error", error.trim())
  }
  const query = params.toString()
  return query.length > 0 ? `/login?${query}` : "/login"
}
