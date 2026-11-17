/** Cookie holding the workspace-selected offer UUID (Hub top-bar switcher). */
export const OFFER_COOKIE = "eh-offer-id"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isOfferId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value)
}

export function readOfferCookie(
  source: string | null | undefined = typeof document === "undefined"
    ? null
    : document.cookie
): string | null {
  if (!source) {
    return null
  }
  const match = source.match(new RegExp(`(?:^|;\\s*)${OFFER_COOKIE}=([^;]*)`))
  if (!match?.[1]) {
    return null
  }
  try {
    const value = decodeURIComponent(match[1])
    return isOfferId(value) ? value : null
  } catch {
    return null
  }
}

export function writeOfferCookie(offerId: string | null): void {
  if (typeof document === "undefined") {
    return
  }
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
  if (offerId === null) {
    document.cookie = `${OFFER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${
      secure ? "; Secure" : ""
    }`
    return
  }
  document.cookie = `${OFFER_COOKIE}=${encodeURIComponent(offerId)}; Path=/; Max-Age=${
    60 * 60 * 24 * 365
  }; SameSite=Lax${secure ? "; Secure" : ""}`
}

export function resolveSelectedOfferId(
  offers: readonly { id: string }[],
  preferredId: string | null
): string | null {
  if (preferredId && offers.some((offer) => offer.id === preferredId)) {
    return preferredId
  }
  return offers[0]?.id ?? null
}
