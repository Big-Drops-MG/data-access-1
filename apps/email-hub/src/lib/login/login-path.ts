import { safeNextPath } from "./safe-next-path"

type LoginPathOptions = {
  next?: string | null
  error?: string | null
}

/**
 * Build a `/login` URL with a sanitised `next` and optional `error` query.
 */
export function buildLoginPath({ next, error }: LoginPathOptions = {}): string {
  const params = new URLSearchParams()
  const safeNext = safeNextPath(next)
  params.set("next", safeNext)
  if (error != null && error.trim() !== "") {
    params.set("error", error.trim())
  }
  return `/login?${params.toString()}`
}
