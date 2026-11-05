import { createHmac, timingSafeEqual } from "node:crypto"

import { uuidSchema } from "./schemas.js"

const TOKEN_VERSION = "v1"

/** Hub unsubscribe tokens remain valid for 180 days after issue (SD#9.6 / SD#10.5). */
export const UNSUBSCRIBE_TOKEN_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000

export class UnsubscribeTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsubscribeTokenError"
  }
}

export type UnsubscribeTokenVerification =
  | { status: "valid"; messageId: string; issuedAt: Date }
  | { status: "expired"; messageId: string; issuedAt: Date }
  | { status: "invalid" }

export function signUnsubscribeToken(
  secret: string,
  messageId: string,
  options: { now?: Date } = {}
): string {
  const id = canonicalMessageId(messageId)
  const issuedAt = options.now ?? new Date()
  const iat = String(Math.floor(issuedAt.getTime() / 1000))
  const payload = `${TOKEN_VERSION}.${id}.${iat}`
  const mac = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${mac}`
}

/**
 * Verify an HMAC unsubscribe token. Tries each secret (current then previous)
 * so rotation can overlap. Tampered / malformed → `invalid`; age over 180 days
 * → `expired` (message id still returned for logging).
 */
export function verifyUnsubscribeToken(
  secrets: string | readonly (string | undefined | null)[],
  token: string,
  options: { now?: Date; maxAgeMs?: number } = {}
): UnsubscribeTokenVerification {
  const parts = token.split(".")
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) {
    return { status: "invalid" }
  }
  const messageId = parts[1]
  const iatRaw = parts[2]
  const mac = parts[3]
  if (
    !messageId ||
    !iatRaw ||
    !mac ||
    !uuidSchema.safeParse(messageId).success ||
    !/^[1-9]\d*$/.test(iatRaw)
  ) {
    return { status: "invalid" }
  }

  const issuedAtSec = Number(iatRaw)
  if (!Number.isSafeInteger(issuedAtSec)) {
    return { status: "invalid" }
  }
  const issuedAt = new Date(issuedAtSec * 1000)
  if (Number.isNaN(issuedAt.getTime())) {
    return { status: "invalid" }
  }

  const payload = `${TOKEN_VERSION}.${messageId}.${iatRaw}`
  const candidates = normalizeSecrets(secrets)
  if (candidates.length === 0) {
    return { status: "invalid" }
  }

  let matched = false
  for (const secret of candidates) {
    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("base64url")
    const expectedBytes = Buffer.from(expected)
    const actualBytes = Buffer.from(mac)
    if (
      expectedBytes.length === actualBytes.length &&
      timingSafeEqual(expectedBytes, actualBytes)
    ) {
      matched = true
      break
    }
  }
  if (!matched) {
    return { status: "invalid" }
  }

  const now = options.now ?? new Date()
  const maxAgeMs = options.maxAgeMs ?? UNSUBSCRIBE_TOKEN_MAX_AGE_MS
  if (
    issuedAt.getTime() > now.getTime() + 60_000 ||
    now.getTime() - issuedAt.getTime() > maxAgeMs
  ) {
    return { status: "expired", messageId, issuedAt }
  }
  return { status: "valid", messageId, issuedAt }
}

export function buildUnsubscribeUrl(input: {
  origin: string | undefined
  secret: string | undefined
  messageId: string
  /** Footer / confirm page by default; one-click uses `/api/u`. */
  path?: "unsubscribe" | "api/u"
  now?: Date
}): string {
  const origin = input.origin?.trim().replace(/\/+$/, "") ?? ""
  const secret = input.secret?.trim() ?? ""
  if (origin === "" || secret === "") {
    throw new UnsubscribeTokenError("Unsubscribe URL is not configured")
  }
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new UnsubscribeTokenError("Unsubscribe URL is not configured")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsubscribeTokenError("Unsubscribe URL is not configured")
  }
  const token = signUnsubscribeToken(secret, input.messageId, {
    now: input.now,
  })
  const path = input.path ?? "unsubscribe"
  return `${parsed.origin}/${path}/${token}`
}

function normalizeSecrets(
  secrets: string | readonly (string | undefined | null)[]
): string[] {
  const list = typeof secrets === "string" ? [secrets] : secrets
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of list) {
    const trimmed = value?.trim() ?? ""
    if (trimmed === "" || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function canonicalMessageId(messageId: string): string {
  const parsed = uuidSchema.safeParse(messageId)
  if (!parsed.success) {
    throw new UnsubscribeTokenError("Unsubscribe URL is not configured")
  }
  return parsed.data
}
