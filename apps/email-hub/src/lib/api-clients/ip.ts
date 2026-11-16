import { isIP } from "node:net"

/**
 * Client IP for API-client allowlists.
 *
 * Coolify/Traefik appends the connecting peer to X-Forwarded-For. The
 * leftmost value is client-supplied and is ignored. `TRUSTED_PROXY_HOPS`
 * (default 1) counts trusted proxies from the right. A shorter chain does
 * not fall back to the leftmost address. X-Real-IP is used only when
 * X-Forwarded-For is absent, and only if the proxy overwrites it.
 *
 * An empty allowlist allows any IP, including an unknown one. That is the
 * existing api_client policy. Entries are exact IPv4 or IPv6 addresses.
 * CIDR ranges are rejected.
 */
const MAX_TRUSTED_PROXY_HOPS = 5
const DEFAULT_TRUSTED_PROXY_HOPS = 1

export function trustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim()
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_TRUSTED_PROXY_HOPS
  }
  const value = Number(raw)
  if (value > MAX_TRUSTED_PROXY_HOPS) {
    return DEFAULT_TRUSTED_PROXY_HOPS
  }
  return value
}

export function canonicalIp(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes("/") || trimmed.includes("%")) {
    return null
  }
  if (isIP(trimmed) === 4) {
    return canonicalIpv4(trimmed)
  }
  if (isIP(trimmed) === 6) {
    return canonicalIpv6(trimmed)
  }
  return null
}

export function readTrustedClientIp(
  request: Request,
  hops: number = trustedProxyHops()
): string | null {
  if (hops <= 0) {
    return null
  }
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    const index = parts.length - hops
    if (index < 0) {
      return null
    }
    return canonicalIp(parts[index] ?? "")
  }
  const realIp = request.headers.get("x-real-ip")?.trim() ?? ""
  if (!realIp || realIp.includes(",")) {
    return null
  }
  return canonicalIp(realIp)
}

export type AllowlistResult =
  | { ok: true; entries: string[] }
  | { ok: false; index: number; message: string }

export function normaliseIpAllowlist(
  values: readonly string[]
): AllowlistResult {
  const entries: string[] = []
  for (const [index, value] of values.entries()) {
    const trimmed = value.trim()
    if (!trimmed) {
      return { ok: false, index, message: "Invalid IP address" }
    }
    if (trimmed.includes("/")) {
      return { ok: false, index, message: "CIDR ranges are not supported" }
    }
    const ip = canonicalIp(trimmed)
    if (!ip) {
      return { ok: false, index, message: "Invalid IP address" }
    }
    if (!entries.includes(ip)) {
      entries.push(ip)
    }
  }
  return { ok: true, entries }
}

/** Empty allowlist: any IP. Otherwise the canonical address must be listed. */
export function ipAllowlistMatches(
  clientIp: string | null | undefined,
  allowlist: readonly string[]
): boolean {
  if (allowlist.length === 0) {
    return true
  }
  if (!clientIp) {
    return false
  }
  const ip = canonicalIp(clientIp)
  if (!ip) {
    return false
  }
  return allowlist.some((entry) => canonicalIp(entry) === ip)
}

function canonicalIpv4(value: string): string | null {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return null
  }
  const parts = value.split(".")
  const nums: number[] = []
  for (const part of parts) {
    if (part.length > 1 && part.startsWith("0")) {
      return null
    }
    const num = Number(part)
    if (!Number.isInteger(num) || num > 255) {
      return null
    }
    nums.push(num)
  }
  return nums.join(".")
}

function canonicalIpv6(value: string): string | null {
  const lower = value.toLowerCase()
  const halves = lower.split("::")
  if (halves.length > 2) {
    return null
  }
  const head = parseIpv6Side(halves[0] ?? "")
  const tail = halves.length === 2 ? parseIpv6Side(halves[1] ?? "") : []
  if (!head || !tail) {
    return null
  }
  if (halves.length === 1 && head.length !== 8) {
    return null
  }
  if (halves.length === 2 && head.length + tail.length > 7) {
    return null
  }
  const missing = 8 - head.length - tail.length
  const groups =
    halves.length === 2
      ? [...head, ...Array.from({ length: missing }, () => 0), ...tail]
      : head
  if (groups.length !== 8) {
    return null
  }
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const high = groups[6] ?? 0
    const low = groups[7] ?? 0
    return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`
  }
  return compressIpv6(groups)
}

function parseIpv6Side(side: string): number[] | null {
  if (!side) {
    return []
  }
  const groups = side.split(":")
  const out: number[] = []
  for (const group of groups) {
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(group)) {
      const v4 = canonicalIpv4(group)
      if (!v4) {
        return null
      }
      const [a, b, c, d] = v4.split(".").map(Number)
      out.push(((a ?? 0) << 8) | (b ?? 0))
      out.push(((c ?? 0) << 8) | (d ?? 0))
      continue
    }
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null
    }
    out.push(Number.parseInt(group, 16))
  }
  return out
}

function compressIpv6(groups: number[]): string {
  let bestStart = -1
  let bestLength = 0
  let index = 0
  while (index < groups.length) {
    if (groups[index] !== 0) {
      index += 1
      continue
    }
    let end = index
    while (end < groups.length && groups[end] === 0) {
      end += 1
    }
    const length = end - index
    if (length > bestLength) {
      bestStart = index
      bestLength = length
    }
    index = end
  }
  const hex = groups.map((group) => group.toString(16))
  if (bestLength < 2) {
    return hex.join(":")
  }
  const left = hex.slice(0, bestStart).join(":")
  const right = hex.slice(bestStart + bestLength).join(":")
  if (!left && !right) {
    return "::"
  }
  if (!left) {
    return `::${right}`
  }
  if (!right) {
    return `${left}::`
  }
  return `${left}::${right}`
}
