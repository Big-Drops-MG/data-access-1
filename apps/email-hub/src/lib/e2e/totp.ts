import { hotp, totp } from "otplib"

const SHARED = {
  digits: 6,
  encoding: "ascii",
} as Parameters<typeof hotp.clone>[0]

export const TOTP_STEP_SECONDS = 30

export function totpCounter(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_STEP_SECONDS)
}

export function currentTotp(secret: string, now = Date.now()): string {
  return totp
    .clone({
      ...SHARED,
      step: TOTP_STEP_SECONDS,
      epoch: now,
    } as Parameters<typeof totp.clone>[0])
    .generate(secret)
}

export function totpForCounter(secret: string, counter: number): string {
  return hotp.clone(SHARED).generate(secret, counter)
}

export function codeOutsideTotpWindow(
  secret: string,
  now = Date.now()
): string {
  return totpForCounter(secret, totpCounter(now) - 2)
}

export function codeDifferentFrom(code: string): string {
  return code === "000000" ? "111111" : "000000"
}
