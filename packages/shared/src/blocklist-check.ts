import { blocklistCheck, domain } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import { ne } from "drizzle-orm"

import { closeAlert, openAlert } from "./alerts.js"
import {
  BLOCKLIST_CHECK_JOB_NAME,
  BLOCKLIST_CHECK_LOOKUP_TIMEOUT_MS,
  type BlocklistCheckJobData,
} from "./blocklist-check-queue.js"
import type { DnsLookup, DnsLookupResult } from "./check-dns.js"
import { createDnsLookup } from "./dns-resolver.js"

export { BLOCKLIST_CHECK_JOB_NAME }

export const BLOCKLIST_LISTED_ALERT_TYPE = "blocklist_listed" as const

export type BlocklistTargetType = "domain" | "ip"

export type BlocklistTarget = {
  targetType: BlocklistTargetType
  target: string
}

export type BlocklistLookup = (queryName: string) => Promise<DnsLookupResult>

export type ProcessBlocklistCheckJobDeps = {
  db: Database
  blocklists: readonly string[]
  checkIps?: readonly string[]
  lookup?: BlocklistLookup
  resolveDomainIps?: (domainName: string) => Promise<string[]>
  now?: Date
}

export type ProcessBlocklistCheckJobResult = {
  lists: number
  targets: number
  checks: number
  listed: number
  errors: number
  alerts_opened: number
  alerts_closed: number
}

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$/

export function parseBlocklists(value: string | undefined | null): string[] {
  return parseCsvHosts(value)
}

export function parseBlocklistCheckIps(
  value: string | undefined | null
): string[] {
  return parseCsvHosts(value).filter((item) => IPV4_RE.test(item))
}

function parseCsvHosts(value: string | undefined | null): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of value.split(",")) {
    const host = part.trim().toLowerCase().replace(/\.$/, "")
    if (!host || seen.has(host)) continue
    seen.add(host)
    out.push(host)
  }
  return out
}

export function blocklistListedAlertDedupeKey(
  target: string,
  listName: string
): string {
  return `blocklist:${target}:${listName}`
}

export function dnsblQueryName(
  targetType: BlocklistTargetType,
  target: string,
  listName: string
): string {
  const list = listName.trim().toLowerCase().replace(/\.$/, "")
  if (targetType === "ip") {
    return `${target.trim().split(".").reverse().join(".")}.${list}`
  }
  return `${target.trim().toLowerCase().replace(/\.$/, "")}.${list}`
}

export type DnsblAInterpretation =
  | { listed: true; codes: string[] }
  | { listed: false }
  | { listed: null; error: string }

export function interpretDnsblARecords(
  values: readonly string[]
): DnsblAInterpretation {
  if (values.length === 0) {
    return { listed: false }
  }

  const policyCodes = values.filter((value) =>
    /^127\.255\.255\.\d+$/.test(value)
  )
  if (policyCodes.length > 0) {
    return {
      listed: null,
      error: `DNSBL policy/error response: ${policyCodes.join(",")}`,
    }
  }

  const listedCodes = values.filter((value) => /^127\./.test(value))
  if (listedCodes.length > 0) {
    return { listed: true, codes: listedCodes }
  }

  return {
    listed: null,
    error: `Unexpected DNSBL A answers: ${values.join(",")}`,
  }
}

function lookupFromDnsLookup(lookup: DnsLookup): BlocklistLookup {
  return (queryName) => lookup({ name: queryName, recordType: "A" })
}

function defaultResolveDomainIps(lookup: DnsLookup) {
  return async (domainName: string): Promise<string[]> => {
    const result = await lookup({ name: domainName, recordType: "A" })
    if (result.kind !== "found") return []
    return result.values.filter((value) => IPV4_RE.test(value))
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`DNSBL lookup timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function collectBlocklistTargets(
  db: Database,
  input: {
    checkIps?: readonly string[]
    resolveDomainIps?: (domainName: string) => Promise<string[]>
  }
): Promise<BlocklistTarget[]> {
  const domains = await db
    .select({ name: domain.name })
    .from(domain)
    .where(ne(domain.status, "inactive"))

  const targets: BlocklistTarget[] = []
  const seen = new Set<string>()

  const add = (targetType: BlocklistTargetType, target: string) => {
    const normalised =
      targetType === "ip"
        ? target.trim()
        : target.trim().toLowerCase().replace(/\.$/, "")
    if (!normalised) return
    const key = `${targetType}:${normalised}`
    if (seen.has(key)) return
    seen.add(key)
    targets.push({ targetType, target: normalised })
  }

  for (const ip of input.checkIps ?? []) {
    if (IPV4_RE.test(ip)) add("ip", ip)
  }

  for (const row of domains) {
    add("domain", row.name)
    if (input.resolveDomainIps) {
      const ips = await input.resolveDomainIps(row.name)
      for (const ip of ips) {
        if (IPV4_RE.test(ip)) add("ip", ip)
      }
    }
  }

  return targets
}

export async function processBlocklistCheckJob(
  _data: BlocklistCheckJobData | undefined,
  deps: ProcessBlocklistCheckJobDeps
): Promise<ProcessBlocklistCheckJobResult> {
  const logger = getContextLogger()
  const now = deps.now ?? new Date()
  const lists = [...deps.blocklists]
    .map((list) => list.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean)

  if (lists.length === 0) {
    logger.info(
      { event: "blocklist_check.skipped", reason: "no_blocklists" },
      "blocklist-check skipped; BLOCKLISTS empty"
    )
    return {
      lists: 0,
      targets: 0,
      checks: 0,
      listed: 0,
      errors: 0,
      alerts_opened: 0,
      alerts_closed: 0,
    }
  }

  const dnsDeps = (() => {
    if (deps.lookup && deps.resolveDomainIps) {
      return {
        lookup: deps.lookup,
        resolveDomainIps: deps.resolveDomainIps,
      }
    }
    const publicDns = createDnsLookup()
    const systemDns = createDnsLookup([])
    return {
      lookup: deps.lookup ?? lookupFromDnsLookup(systemDns),
      resolveDomainIps:
        deps.resolveDomainIps ?? defaultResolveDomainIps(publicDns),
    }
  })()

  const targets = await collectBlocklistTargets(deps.db, {
    checkIps: deps.checkIps,
    resolveDomainIps: dnsDeps.resolveDomainIps,
  })

  let checks = 0
  let listedCount = 0
  let errors = 0
  let alertsOpened = 0
  let alertsClosed = 0

  for (const target of targets) {
    for (const listName of lists) {
      checks += 1
      const queryName = dnsblQueryName(
        target.targetType,
        target.target,
        listName
      )
      let listed: boolean | null
      let error: string | null = null

      try {
        const result = await withTimeout(
          dnsDeps.lookup(queryName),
          BLOCKLIST_CHECK_LOOKUP_TIMEOUT_MS
        )
        if (result.kind === "found") {
          const interpreted = interpretDnsblARecords(result.values)
          if (interpreted.listed === true) {
            listed = true
          } else if (interpreted.listed === false) {
            listed = false
          } else {
            listed = null
            error = interpreted.error
          }
        } else if (result.kind === "not_found") {
          listed = false
        } else {
          listed = null
          error = result.message
        }
      } catch (lookupError) {
        listed = null
        error =
          lookupError instanceof Error
            ? lookupError.message
            : "DNSBL lookup failed"
      }

      await deps.db.insert(blocklistCheck).values({
        targetType: target.targetType,
        target: target.target,
        listName,
        listed,
        checkedAt: now,
        error,
      })

      if (listed === null) {
        errors += 1
        continue
      }

      const dedupeKey = blocklistListedAlertDedupeKey(target.target, listName)
      if (listed) {
        listedCount += 1
        const opened = await openAlert(deps.db, {
          type: BLOCKLIST_LISTED_ALERT_TYPE,
          severity: "critical",
          dedupeKey,
          payload: {
            target: target.target,
            target_type: target.targetType,
            list_name: listName,
            query_name: queryName,
          },
          now,
          refreshPayload: true,
        })
        if (opened.created) alertsOpened += 1
      } else {
        const closed = await closeAlert(deps.db, {
          type: BLOCKLIST_LISTED_ALERT_TYPE,
          dedupeKey,
          now,
        })
        if (closed.closed) alertsClosed += 1
      }
    }
  }

  logger.info(
    {
      event: "blocklist_check.completed",
      lists: lists.length,
      targets: targets.length,
      checks,
      listed: listedCount,
      errors,
      alerts_opened: alertsOpened,
      alerts_closed: alertsClosed,
    },
    "blocklist-check completed"
  )

  return {
    lists: lists.length,
    targets: targets.length,
    checks,
    listed: listedCount,
    errors,
    alerts_opened: alertsOpened,
    alerts_closed: alertsClosed,
  }
}
