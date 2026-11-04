import { TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS } from "./two-factor-policy"

/** Short-lived cookies set when OAuth starts a 2FA challenge (verify page). */
export const TWO_FACTOR_EMAIL_COOKIE = "emailhub_2fa_email"
export const TWO_FACTOR_USER_COOKIE = "emailhub_2fa_user"

/** Raw trust token. The database stores only a hash of this value. */
export const TRUSTED_DEVICE_COOKIE = "emailhub_trusted_device"

export function trustedDeviceCookieAttributes(secure: boolean) {
  return {
    maxAge: TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure,
  }
}
