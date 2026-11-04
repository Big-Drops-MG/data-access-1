/** Cookie set by `proxy` so client error boundaries can show the request id. */
export const REQUEST_ID_COOKIE = "eh-request-id"

export function readClientRequestId(): string | null {
  if (typeof document === "undefined") {
    return null
  }

  const meta = document
    .querySelector('meta[name="x-request-id"]')
    ?.getAttribute("content")
    ?.trim()
  if (meta) {
    return meta
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${REQUEST_ID_COOKIE}=([^;]*)`)
  )
  if (!match?.[1]) {
    return null
  }
  try {
    return decodeURIComponent(match[1]) || null
  } catch {
    return match[1] || null
  }
}
