/**
 * Extract the base32 secret from an otpauth:// URI for manual entry.
 */
export function secretFromTotpUri(totpURI: string): string | null {
  try {
    const url = new URL(totpURI)
    const secret = url.searchParams.get("secret")
    return secret && secret.trim() !== "" ? secret.trim() : null
  } catch {
    return null
  }
}

/** Format a base32 secret as groups of 4 for display / copy. */
export function formatTotpSecret(secret: string): string {
  const compact = secret.replace(/\s+/g, "").toUpperCase()
  return compact.replace(/(.{4})/g, "$1 ").trim()
}
