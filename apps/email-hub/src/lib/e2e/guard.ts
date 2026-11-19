import { timingSafeEqual } from "node:crypto"

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"])

export function e2eHarnessEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false
  }
  if (process.env.EMAILHUB_ENV !== "dev") {
    return false
  }
  const flag = process.env.E2E
  if (flag !== "1" && flag !== "true") {
    return false
  }
  const secret = process.env.E2E_AUTH_SECRET
  return typeof secret === "string" && secret.length >= 32
}

export function authorizeE2eRequest(request: Request): boolean {
  if (!e2eHarnessEnabled()) {
    return false
  }

  let hostname: string
  try {
    hostname = new URL(request.url).hostname
  } catch {
    return false
  }
  if (!LOOPBACK_HOSTS.has(hostname)) {
    return false
  }

  const expected = process.env.E2E_AUTH_SECRET ?? ""
  const header = request.headers.get("authorization") ?? ""
  if (!header.startsWith("Bearer ")) {
    return false
  }
  const presented = header.slice("Bearer ".length)
  const presentedBytes = Buffer.from(presented)
  const expectedBytes = Buffer.from(expected)
  if (presentedBytes.length !== expectedBytes.length) {
    return false
  }
  return timingSafeEqual(presentedBytes, expectedBytes)
}
