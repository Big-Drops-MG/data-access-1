import { loadServerEnv } from "@workspace/shared"

export type CloudflareDnsRecordInput = {
  purpose: "spf" | "dkim" | "dmarc" | "mx"
  name: string
  recordType: string
  expectedValue: string
}

export type CloudflareDnsDeps = {
  apiToken?: string
  zoneId?: string
  fetchImpl?: typeof fetch
}

export class CloudflareDnsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "CloudflareDnsError"
  }
}

type CfListResponse<T> = {
  success: boolean
  errors?: Array<{ message?: string }>
  result?: T
}

type CfZone = { id: string; name: string }

type CfDnsRecord = {
  id: string
  type: string
  name: string
  content: string
  priority?: number
  proxied?: boolean
}

const CF_API = "https://api.cloudflare.com/client/v4"

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "")
}

function stripTxtQuotes(value: string): string {
  return value
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/"\s*"/g, "")
}

function zoneNameCandidates(domainName: string): string[] {
  const labels = normalizeHost(domainName).split(".").filter(Boolean)
  const names: string[] = []
  for (let i = 0; i < labels.length - 1; i += 1) {
    names.push(labels.slice(i).join("."))
  }
  return names
}

function parseMx(value: string): { priority: number; content: string } {
  const [priorityRaw = "10", ...rest] = value.trim().split(/\s+/)
  const priority = Number(priorityRaw)
  return {
    priority: Number.isFinite(priority) ? priority : 10,
    content: normalizeHost(rest.join(" ")),
  }
}

/** Ensure `include:amazonses.com` is present in an existing SPF record. */
export function mergeSesSpfInclude(existingSpf: string): string {
  const normalized = stripTxtQuotes(existingSpf).replace(/\s+/g, " ").trim()
  if (!/^v=spf1\b/i.test(normalized)) {
    return "v=spf1 include:amazonses.com ~all"
  }
  if (/\binclude:amazonses\.com\b/i.test(normalized)) {
    return normalized
  }
  const withoutAll = normalized.replace(/\s+([~?-]all)\s*$/i, "")
  const allMatch = normalized.match(/\s+([~?-]all)\s*$/i)
  const all = allMatch?.[1] ?? "~all"
  return `${withoutAll} include:amazonses.com ${all}`
    .replace(/\s+/g, " ")
    .trim()
}

function readCloudflareEnv(): {
  apiToken: string | undefined
  zoneId: string | undefined
} {
  const env = loadServerEnv("web") as {
    CLOUDFLARE_API_TOKEN?: string
    CLOUDFLARE_ZONE_ID?: string
  }
  return {
    apiToken: env.CLOUDFLARE_API_TOKEN?.trim() || undefined,
    zoneId: env.CLOUDFLARE_ZONE_ID?.trim() || undefined,
  }
}

/** True when CLOUDFLARE_API_TOKEN is set (auto DNS enabled). */
export function isCloudflareDnsConfigured(
  deps: CloudflareDnsDeps = {}
): boolean {
  if (deps.apiToken !== undefined) {
    return Boolean(deps.apiToken.trim())
  }
  return Boolean(readCloudflareEnv().apiToken)
}

function cloudflareConfig(): { apiToken: string; zoneId?: string } {
  const env = readCloudflareEnv()
  if (!env.apiToken) {
    throw new CloudflareDnsError(
      "CLOUDFLARE_API_TOKEN is not configured — cannot write DNS records"
    )
  }
  return {
    apiToken: env.apiToken,
    zoneId: env.zoneId,
  }
}

async function cfFetch<T>(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  apiToken: string
): Promise<T> {
  const response = await fetchImpl(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  let body: CfListResponse<T>
  try {
    body = (await response.json()) as CfListResponse<T>
  } catch (error) {
    throw new CloudflareDnsError(
      `Cloudflare API returned non-JSON (${response.status})`,
      { cause: error }
    )
  }
  if (!response.ok || !body.success) {
    const detail =
      body.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join("; ") || `HTTP ${response.status}`
    throw new CloudflareDnsError(`Cloudflare API error: ${detail}`)
  }
  return body.result as T
}

async function resolveZoneId(
  domainName: string,
  apiToken: string,
  preferredZoneId: string | undefined,
  fetchImpl: typeof fetch
): Promise<string> {
  if (preferredZoneId) {
    return preferredZoneId
  }
  for (const name of zoneNameCandidates(domainName)) {
    const zones = await cfFetch<CfZone[]>(
      `/zones?name=${encodeURIComponent(name)}&status=active`,
      { method: "GET" },
      fetchImpl,
      apiToken
    )
    const match = zones.find((zone) => normalizeHost(zone.name) === name)
    if (match) {
      return match.id
    }
  }
  throw new CloudflareDnsError(
    `No Cloudflare zone found for ${normalizeHost(domainName)}`
  )
}

async function listDnsRecords(
  zoneId: string,
  type: string,
  name: string,
  apiToken: string,
  fetchImpl: typeof fetch
): Promise<CfDnsRecord[]> {
  const search = new URLSearchParams({
    type,
    name: normalizeHost(name),
    per_page: "100",
  })
  const result = await cfFetch<CfDnsRecord[]>(
    `/zones/${zoneId}/dns_records?${search.toString()}`,
    { method: "GET" },
    fetchImpl,
    apiToken
  )
  return result ?? []
}

async function createDnsRecord(
  zoneId: string,
  body: Record<string, unknown>,
  apiToken: string,
  fetchImpl: typeof fetch
): Promise<void> {
  await cfFetch(
    `/zones/${zoneId}/dns_records`,
    { method: "POST", body: JSON.stringify(body) },
    fetchImpl,
    apiToken
  )
}

async function updateDnsRecord(
  zoneId: string,
  recordId: string,
  body: Record<string, unknown>,
  apiToken: string,
  fetchImpl: typeof fetch
): Promise<void> {
  await cfFetch(
    `/zones/${zoneId}/dns_records/${recordId}`,
    { method: "PUT", body: JSON.stringify(body) },
    fetchImpl,
    apiToken
  )
}

async function destroyDnsRecord(
  zoneId: string,
  recordId: string,
  apiToken: string,
  fetchImpl: typeof fetch
): Promise<void> {
  await cfFetch(
    `/zones/${zoneId}/dns_records/${recordId}`,
    { method: "DELETE" },
    fetchImpl,
    apiToken
  )
}

function buildPayload(
  record: CloudflareDnsRecordInput,
  contentOverride?: string
): Record<string, unknown> {
  const type = record.recordType.toUpperCase()
  const name = normalizeHost(record.name)

  if (type === "MX") {
    const mx = parseMx(contentOverride ?? record.expectedValue)
    return {
      type,
      name,
      content: mx.content,
      priority: mx.priority,
      ttl: 1,
      comment: "Email Hub SES",
    }
  }

  if (type === "CNAME") {
    return {
      type,
      name,
      content: normalizeHost(contentOverride ?? record.expectedValue),
      ttl: 1,
      proxied: false,
      comment: "Email Hub SES",
    }
  }

  return {
    type,
    name,
    content: contentOverride ?? record.expectedValue,
    ttl: 1,
    comment: "Email Hub SES",
  }
}

async function upsertOne(
  zoneId: string,
  record: CloudflareDnsRecordInput,
  domainName: string,
  apiToken: string,
  fetchImpl: typeof fetch
): Promise<void> {
  const type = record.recordType.toUpperCase()
  const name = normalizeHost(record.name)
  const existing = await listDnsRecords(zoneId, type, name, apiToken, fetchImpl)

  if (type === "TXT" && record.purpose === "spf") {
    const spfRow = existing.find((row) =>
      stripTxtQuotes(row.content).toLowerCase().startsWith("v=spf1")
    )
    const isApex = name === normalizeHost(domainName)
    const content = isApex
      ? mergeSesSpfInclude(spfRow?.content ?? record.expectedValue)
      : record.expectedValue
    const payload = buildPayload(record, content)
    if (spfRow) {
      if (stripTxtQuotes(spfRow.content) === stripTxtQuotes(content)) {
        return
      }
      await updateDnsRecord(zoneId, spfRow.id, payload, apiToken, fetchImpl)
      return
    }
    await createDnsRecord(zoneId, payload, apiToken, fetchImpl)
    return
  }

  if (type === "MX") {
    const want = parseMx(record.expectedValue)
    const match = existing.find(
      (row) =>
        normalizeHost(row.content) === want.content &&
        Number(row.priority ?? 0) === want.priority
    )
    if (match) {
      return
    }
    const sameHost = existing.find(
      (row) => normalizeHost(row.content) === want.content
    )
    const payload = buildPayload(record)
    if (sameHost) {
      await updateDnsRecord(zoneId, sameHost.id, payload, apiToken, fetchImpl)
      return
    }
    await createDnsRecord(zoneId, payload, apiToken, fetchImpl)
    return
  }

  const wantContent =
    type === "CNAME"
      ? normalizeHost(record.expectedValue)
      : record.expectedValue
  const match = existing.find((row) =>
    type === "CNAME"
      ? normalizeHost(row.content) === wantContent
      : stripTxtQuotes(row.content) === stripTxtQuotes(wantContent)
  )
  if (match) {
    return
  }
  const sameName = existing[0]
  const payload = buildPayload(record)
  if (sameName && (type === "CNAME" || type === "TXT")) {
    await updateDnsRecord(zoneId, sameName.id, payload, apiToken, fetchImpl)
    return
  }
  await createDnsRecord(zoneId, payload, apiToken, fetchImpl)
}

function resolveCredentials(deps: CloudflareDnsDeps): {
  apiToken: string
  zoneId?: string
} {
  if (deps.apiToken !== undefined) {
    const apiToken = deps.apiToken.trim()
    if (!apiToken) {
      throw new CloudflareDnsError(
        "CLOUDFLARE_API_TOKEN is not configured — cannot write DNS records"
      )
    }
    return {
      apiToken,
      zoneId: deps.zoneId?.trim() || undefined,
    }
  }
  const config = cloudflareConfig()
  return {
    apiToken: config.apiToken,
    zoneId: deps.zoneId?.trim() || config.zoneId,
  }
}

/**
 * Create or update SES DNS records in Cloudflare (DNS-only; never proxied).
 * Runs upserts in parallel for speed.
 */
export async function upsertCloudflareDnsRecords(
  domainName: string,
  records: readonly CloudflareDnsRecordInput[],
  deps: CloudflareDnsDeps = {}
): Promise<{ upserted: number; zone_id: string }> {
  if (records.length === 0) {
    return { upserted: 0, zone_id: "" }
  }

  const { apiToken, zoneId: preferredZoneId } = resolveCredentials(deps)
  const fetchImpl = deps.fetchImpl ?? fetch
  const zoneId = await resolveZoneId(
    domainName,
    apiToken,
    preferredZoneId,
    fetchImpl
  )

  await Promise.all(
    records.map((record) =>
      upsertOne(zoneId, record, domainName, apiToken, fetchImpl)
    )
  )

  return { upserted: records.length, zone_id: zoneId }
}

function isSesOwnedHostname(
  domainName: string,
  record: CloudflareDnsRecordInput
): boolean {
  const name = normalizeHost(record.name)
  const apex = normalizeHost(domainName)
  if (record.purpose === "dkim" || record.purpose === "dmarc") {
    return true
  }
  if (record.purpose === "mx") {
    return true
  }
  // MAIL FROM SPF lives on a subdomain, not the apex.
  if (record.purpose === "spf" && name !== apex) {
    return true
  }
  return false
}

/**
 * Remove SES DNS rows we manage for this domain.
 * Apex SPF keeps the record and only drops `include:amazonses.com` when possible.
 * DKIM / DMARC / MAIL FROM hostnames are deleted outright.
 */
export async function deleteCloudflareDnsRecords(
  domainName: string,
  records: readonly CloudflareDnsRecordInput[],
  deps: CloudflareDnsDeps = {}
): Promise<{ deleted: number }> {
  if (records.length === 0) {
    return { deleted: 0 }
  }

  const credentials = resolveCredentials(deps)
  const fetchImpl = deps.fetchImpl ?? fetch
  const zoneId = await resolveZoneId(
    domainName,
    credentials.apiToken,
    credentials.zoneId,
    fetchImpl
  )
  const apiToken = credentials.apiToken
  const apex = normalizeHost(domainName)

  let deleted = 0
  await Promise.all(
    records.map(async (record) => {
      const type = record.recordType.toUpperCase()
      const name = normalizeHost(record.name)
      const existing = await listDnsRecords(
        zoneId,
        type,
        name,
        apiToken,
        fetchImpl
      )
      if (existing.length === 0) {
        return
      }

      // Apex SPF: unmerge amazonses include; do not wipe unrelated SPF.
      if (type === "TXT" && record.purpose === "spf" && name === apex) {
        const spfRow = existing.find((row) =>
          stripTxtQuotes(row.content).toLowerCase().startsWith("v=spf1")
        )
        if (!spfRow) {
          return
        }
        const current = stripTxtQuotes(spfRow.content)
        if (!/\binclude:amazonses\.com\b/i.test(current)) {
          return
        }
        const next = current
          .replace(/\s*include:amazonses\.com\b/gi, "")
          .replace(/\s+/g, " ")
          .trim()
        if (
          next.toLowerCase() === "v=spf1" ||
          /^v=spf1\s*[~?-]?all$/i.test(next)
        ) {
          await destroyDnsRecord(zoneId, spfRow.id, apiToken, fetchImpl)
          deleted += 1
          return
        }
        await updateDnsRecord(
          zoneId,
          spfRow.id,
          buildPayload(record, next),
          apiToken,
          fetchImpl
        )
        deleted += 1
        return
      }

      // SES-owned hostnames (DKIM, DMARC, MAIL FROM): delete those rows.
      if (!isSesOwnedHostname(domainName, record)) {
        return
      }
      for (const row of existing) {
        await destroyDnsRecord(zoneId, row.id, apiToken, fetchImpl)
        deleted += 1
      }
    })
  )

  return { deleted }
}
