import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { AppError } from "@workspace/shared"

/** SD#10.2 / SD#14.4 — ±5 minutes. */
export const MACHINE_TIMESTAMP_SKEW_SECONDS = 300

/** Overlap window after rotation (API client lifecycle). */
export const MACHINE_OLD_SECRET_TTL_MS = 24 * 60 * 60 * 1000

export const MACHINE_RATE_LIMIT_PER_MINUTE = 600

export const MACHINE_SCOPES = [
  "emails:send",
  "emails:read",
  "arohaa:webhook",
] as const

export type MachineScope = (typeof MACHINE_SCOPES)[number]

export type MachineClientAuthRecord = {
  id: string
  status: "active" | "revoked"
  scopes: string[]
  /** Empty allowlist means any IP is allowed. */
  ipAllowlist: string[]
  /** Current HMAC secret (plaintext). */
  secret: string
  /** Previous secret during rotation overlap. */
  oldSecret: string | null
  rotatedAt: Date | null
}

export type MachineRateLimitResult = "ok" | "limited" | "unavailable"

export type AuthenticateMachineDeps = {
  requiredScope: string
  resolveClient: (keyId: string) => Promise<MachineClientAuthRecord | null>
  consumeRateLimit: (keyId: string) => Promise<MachineRateLimitResult>
  now?: () => Date
  /** Override detected client IP (tests). */
  clientIp?: string | null
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex")
}

/**
 * Canonical string for machine HMAC (SD#10.2):
 * `timestamp.METHOD.path_with_query.sha256_hex(body)`
 */
export function buildMachineSigningPayload(input: {
  timestamp: string
  method: string
  pathWithQuery: string
  body: Buffer
}): string {
  return [
    input.timestamp,
    input.method.toUpperCase(),
    input.pathWithQuery,
    sha256Hex(input.body),
  ].join(".")
}

export function signMachinePayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex")
}

/** Constant-time compare of hex signatures (SD#14.4). */
export function signaturesMatch(
  expectedHex: string,
  providedHex: string
): boolean {
  const a = Buffer.from(expectedHex, "utf8")
  const b = Buffer.from(providedHex, "utf8")
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(a, b)
}

export function isTimestampWithinSkew(
  timestampSeconds: number,
  now: Date,
  skewSeconds: number = MACHINE_TIMESTAMP_SKEW_SECONDS
): boolean {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  return Math.abs(nowSeconds - timestampSeconds) <= skewSeconds
}

export function isOldSecretStillValid(
  rotatedAt: Date | null,
  now: Date
): boolean {
  if (!rotatedAt) {
    return false
  }
  return now.getTime() - rotatedAt.getTime() <= MACHINE_OLD_SECRET_TTL_MS
}

export function clientHasScope(
  scopes: readonly string[],
  required: string
): boolean {
  return scopes.includes(required)
}

export function isClientIpAllowed(
  clientIp: string | null | undefined,
  allowlist: readonly string[]
): boolean {
  if (allowlist.length === 0) {
    return true
  }
  if (!clientIp) {
    return false
  }
  return allowlist.includes(clientIp)
}

export function readClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) {
      return first
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim()
  return realIp || null
}

function header(request: Request, name: string): string | null {
  const value = request.headers.get(name)?.trim()
  return value && value.length > 0 ? value : null
}

/**
 * Full machine auth for `/api/ext/**` (except SNS webhooks).
 * Returns the authenticated client on success; throws `AppError` otherwise.
 */
export async function authenticateMachineRequest(
  request: Request,
  rawBody: Buffer,
  deps: AuthenticateMachineDeps
): Promise<MachineClientAuthRecord> {
  const keyId = header(request, "x-key-id")
  const timestampRaw = header(request, "x-timestamp")
  const signature = header(request, "x-signature")

  if (!keyId || !timestampRaw || !signature) {
    throw AppError.unauthorized([
      {
        path: "authorization",
        message: "Machine authentication required",
      },
    ])
  }

  if (!/^\d+$/.test(timestampRaw)) {
    throw AppError.unauthorized([
      { path: "x-timestamp", message: "Must be unix seconds" },
    ])
  }

  const now = deps.now?.() ?? new Date()
  const timestampSeconds = Number(timestampRaw)
  if (!isTimestampWithinSkew(timestampSeconds, now)) {
    throw AppError.unauthorized([
      { path: "x-timestamp", message: "Timestamp outside allowed window" },
    ])
  }

  const client = await deps.resolveClient(keyId)
  if (!client || client.status !== "active") {
    throw AppError.unauthorized([
      { path: "x-key-id", message: "Unknown or disabled API client" },
    ])
  }

  const clientIp =
    deps.clientIp !== undefined ? deps.clientIp : readClientIp(request)
  if (!isClientIpAllowed(clientIp, client.ipAllowlist)) {
    throw AppError.forbidden([
      { path: "authorization", message: "Client IP is not allowlisted" },
    ])
  }

  const url = new URL(request.url)
  const pathWithQuery = `${url.pathname}${url.search}`
  const payload = buildMachineSigningPayload({
    timestamp: timestampRaw,
    method: request.method,
    pathWithQuery,
    body: rawBody,
  })

  const expectedCurrent = signMachinePayload(client.secret, payload)
  let valid = signaturesMatch(expectedCurrent, signature.toLowerCase())
  if (
    !valid &&
    client.oldSecret &&
    isOldSecretStillValid(client.rotatedAt, now)
  ) {
    const expectedOld = signMachinePayload(client.oldSecret, payload)
    valid = signaturesMatch(expectedOld, signature.toLowerCase())
  }

  if (!valid) {
    throw AppError.unauthorized([
      { path: "x-signature", message: "Invalid signature" },
    ])
  }

  if (!clientHasScope(client.scopes, deps.requiredScope)) {
    throw AppError.forbidden([
      {
        path: "authorization",
        message: "Key scope does not allow this endpoint",
      },
    ])
  }

  const rate = await deps.consumeRateLimit(client.id)
  if (rate === "unavailable") {
    throw AppError.unavailable([
      { path: "rate_limit", message: "Rate limiter unavailable" },
    ])
  }
  if (rate === "limited") {
    throw AppError.rateLimited([
      { path: "rate_limit", message: "Too many requests for this key" },
    ])
  }

  return client
}
