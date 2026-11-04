import { createHmac, timingSafeEqual } from "node:crypto"

import { uuidSchema } from "./schemas.js"

const TOKEN_VERSION = "v1"

export class UnsubscribeTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsubscribeTokenError"
  }
}

export function signUnsubscribeToken(
  secret: string,
  messageId: string
): string {
  const id = canonicalMessageId(messageId)
  const mac = createHmac("sha256", secret)
    .update(`${TOKEN_VERSION}.${id}`)
    .digest("base64url")
  return `${TOKEN_VERSION}.${id}.${mac}`
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string
): string | null {
  const parts = token.split(".")
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return null
  }
  const messageId = parts[1]
  const mac = parts[2]
  if (!messageId || !mac || !uuidSchema.safeParse(messageId).success) {
    return null
  }
  const expected = createHmac("sha256", secret)
    .update(`${TOKEN_VERSION}.${messageId}`)
    .digest("base64url")
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(mac)
  if (
    expectedBytes.length !== actualBytes.length ||
    !timingSafeEqual(expectedBytes, actualBytes)
  ) {
    return null
  }
  return messageId
}

export function buildUnsubscribeUrl(input: {
  origin: string | undefined
  secret: string | undefined
  messageId: string
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
  const token = signUnsubscribeToken(secret, input.messageId)
  return `${parsed.origin}/unsubscribe/${token}`
}

function canonicalMessageId(messageId: string): string {
  const parsed = uuidSchema.safeParse(messageId)
  if (!parsed.success) {
    throw new UnsubscribeTokenError("Unsubscribe URL is not configured")
  }
  return parsed.data
}
