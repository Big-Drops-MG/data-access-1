export const E2E_PERSONAS = ["login", "twoFactor", "lockout"] as const

export type E2ePersona = (typeof E2E_PERSONAS)[number]

const PERSONA_ENV: Record<E2ePersona, string> = {
  login: "E2E_LOGIN_EMAIL",
  twoFactor: "E2E_2FA_EMAIL",
  lockout: "E2E_LOCKOUT_EMAIL",
}

export function isE2ePersona(value: unknown): value is E2ePersona {
  return (
    typeof value === "string" &&
    (E2E_PERSONAS as readonly string[]).includes(value)
  )
}

export function e2ePersonaEmail(persona: E2ePersona): string {
  const email = process.env[PERSONA_ENV[persona]]?.trim().toLowerCase()
  if (!email || !email.includes("@")) {
    throw new Error(`${PERSONA_ENV[persona]} is required for the E2E harness.`)
  }
  return email
}

export function e2ePersonaEmails(): string[] {
  return E2E_PERSONAS.map((persona) => e2ePersonaEmail(persona))
}

function isPrintableAscii(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 33 || code > 126) {
      return false
    }
  }
  return true
}

export function e2eTotpSecret(): string {
  const secret = process.env.E2E_TOTP_SECRET ?? ""
  if (secret.length < 32 || !isPrintableAscii(secret)) {
    throw new Error(
      "E2E_TOTP_SECRET must be at least 32 printable ASCII characters."
    )
  }
  return secret
}
