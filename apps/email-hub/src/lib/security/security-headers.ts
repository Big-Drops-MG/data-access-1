import {
  buildContentSecurityPolicy,
  sentryIngestHostFromDsn,
} from "@/lib/security/csp-nonce"

export const CSP_NONCE_HEADER = "x-nonce"

export type SecurityHeaderMap = Record<string, string>

export function buildSecurityHeaders(
  nonce: string,
  options: {
    sentryDsn?: string | null
    includeHsts?: boolean
  } = {}
): SecurityHeaderMap {
  const headers: SecurityHeaderMap = {
    "Content-Security-Policy": buildContentSecurityPolicy(nonce, {
      sentryIngestHost: sentryIngestHostFromDsn(options.sentryDsn),
    }),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  }

  if (options.includeHsts !== false) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
  }

  return headers
}

export function applySecurityHeaders(
  target: Headers,
  headers: SecurityHeaderMap
): void {
  for (const [name, value] of Object.entries(headers)) {
    target.set(name, value)
  }
}
