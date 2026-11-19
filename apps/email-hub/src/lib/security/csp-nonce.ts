const NONCE_BYTES = 16

export function createCspNonce(
  randomValues: (bytes: Uint8Array) => Uint8Array = (bytes) =>
    crypto.getRandomValues(bytes)
): string {
  const bytes = randomValues(new Uint8Array(NONCE_BYTES))
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function sentryIngestHostFromDsn(
  dsn: string | null | undefined
): string | null {
  const raw = dsn?.trim()
  if (!raw) {
    return null
  }
  try {
    return new URL(raw).host || null
  } catch {
    return null
  }
}

export function buildContentSecurityPolicy(
  nonce: string,
  options: { sentryIngestHost?: string | null } = {}
): string {
  const connectSrc = ["'self'"]
  const sentryHost = options.sentryIngestHost?.trim()
  if (sentryHost) {
    connectSrc.push(`https://${sentryHost}`)
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")
}
