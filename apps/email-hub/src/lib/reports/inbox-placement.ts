import { and, desc, eq, gte, lt } from "drizzle-orm"

import {
  blocklistCheck,
  message,
  seedAccount,
  seedPlacementResult,
  send,
  template,
  templateVersion,
} from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import { getEtReportRange } from "@workspace/shared"

const DAY_MS = 24 * 60 * 60 * 1000
const ROW_LIMIT = 500

const KNOWN_PROVIDERS = ["gmail", "yahoo", "outlook", "aol", "icloud"] as const

const PROVIDER_LABEL: Record<string, string> = {
  gmail: "Gmail",
  yahoo: "Yahoo",
  outlook: "Outlook",
  aol: "AOL",
  icloud: "iCloud",
}

const PROVIDER_SOURCE: Record<string, string> = {
  gmail: "Seed + Google Postmaster",
  yahoo: "Seed + Yahoo Sender Hub",
  outlook: "Seed + SNDS / JMRP",
  aol: "Seed",
  icloud: "Seed",
}

const PROVIDER_CONFIDENCE: Record<
  string,
  { label: string; tone: "ok" | "warn" }
> = {
  gmail: { label: "Provider reported", tone: "ok" },
  yahoo: { label: "Provider reported", tone: "ok" },
  outlook: { label: "Provider reported", tone: "ok" },
  aol: { label: "Seed inbox and SMTP codes only", tone: "warn" },
  icloud: { label: "Seed inbox and SMTP codes only", tone: "warn" },
}

export type InboxPlacementCount = {
  provider: string
  label: string
  inbox: number
  promotions: number
  spam: number
  source: string
  confidence_label: string
  confidence_tone: "ok" | "warn"
}

export type InboxLatestSend = {
  id: string
  sent_at: string | null
  template: string
  placements: Partial<
    Record<string, "inbox" | "promotions" | "spam" | "missing">
  >
}

export type InboxBlocklistStatus = "clean" | "listed" | "unknown"

export type InboxBlocklistRow = {
  target: string
  spamhaus: InboxBlocklistStatus | null
  barracuda: InboxBlocklistStatus | null
  checked_at: string
}

export type InboxPlacementReport = {
  from: string
  to: string
  placement: InboxPlacementCount[]
  latest_sends: InboxLatestSend[]
  blocklists: InboxBlocklistRow[]
}

export type InboxSeedRow = {
  provider: string
  placement: string
  checkedAt: Date
  messageId: string
  sendId: string | null
  templateName: string | null
  sendName: string | null
  sentAt: Date | null
}

export type BlocklistSeedRow = {
  target: string
  listName: string
  listed: boolean | null
  checkedAt: Date
}

export function canonicalProvider(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (value.includes("gmail") || value.includes("google")) {
    return "gmail"
  }
  if (value.includes("yahoo")) {
    return "yahoo"
  }
  if (
    value.includes("outlook") ||
    value.includes("microsoft") ||
    value.includes("hotmail") ||
    value.includes("live")
  ) {
    return "outlook"
  }
  if (value.includes("aol")) {
    return "aol"
  }
  if (value.includes("icloud") || value.includes("apple")) {
    return "icloud"
  }
  return value || "unknown"
}

function providerLabel(provider: string): string {
  return PROVIDER_LABEL[provider] ?? provider
}

function emptyCounts(): { inbox: number; promotions: number; spam: number } {
  return { inbox: 0, promotions: 0, spam: 0 }
}

export function summarizePlacement(
  rows: InboxSeedRow[]
): InboxPlacementCount[] {
  const counts = new Map<string, ReturnType<typeof emptyCounts>>()
  for (const provider of KNOWN_PROVIDERS) {
    counts.set(provider, emptyCounts())
  }
  for (const row of rows) {
    const provider = canonicalProvider(row.provider)
    const bucket = counts.get(provider) ?? emptyCounts()
    if (row.placement === "inbox") {
      bucket.inbox += 1
    } else if (row.placement === "promotions") {
      bucket.promotions += 1
    } else if (row.placement === "spam") {
      bucket.spam += 1
    }
    counts.set(provider, bucket)
  }

  const extras = [...counts.keys()]
    .filter(
      (provider) =>
        !KNOWN_PROVIDERS.includes(provider as (typeof KNOWN_PROVIDERS)[number])
    )
    .sort()

  return [...KNOWN_PROVIDERS, ...extras].map((provider) => {
    const bucket = counts.get(provider) ?? emptyCounts()
    const confidence = PROVIDER_CONFIDENCE[provider] ?? {
      label: "Seed inbox and SMTP codes only",
      tone: "warn" as const,
    }
    return {
      provider,
      label: providerLabel(provider),
      inbox: bucket.inbox,
      promotions: bucket.promotions,
      spam: bucket.spam,
      source: PROVIDER_SOURCE[provider] ?? "Seed",
      confidence_label: confidence.label,
      confidence_tone: confidence.tone,
    }
  })
}

export function summarizeLatestSends(rows: InboxSeedRow[]): InboxLatestSend[] {
  const groups = new Map<
    string,
    {
      sentAt: Date | null
      template: string
      placements: InboxLatestSend["placements"]
      seen: Map<string, number>
    }
  >()

  const ordered = [...rows].sort(
    (a, b) => b.checkedAt.getTime() - a.checkedAt.getTime()
  )

  for (const row of ordered) {
    const id = row.sendId ?? row.messageId
    const provider = canonicalProvider(row.provider)
    let group = groups.get(id)
    if (!group) {
      group = {
        sentAt: row.sentAt,
        template:
          row.templateName?.trim() || row.sendName?.trim() || "Untitled",
        placements: {},
        seen: new Map(),
      }
      groups.set(id, group)
    }
    if (
      row.sentAt &&
      (!group.sentAt || row.sentAt.getTime() > group.sentAt.getTime())
    ) {
      group.sentAt = row.sentAt
    }
    if (!group.seen.has(provider)) {
      if (
        row.placement === "inbox" ||
        row.placement === "promotions" ||
        row.placement === "spam" ||
        row.placement === "missing"
      ) {
        group.placements[provider] = row.placement
        group.seen.set(provider, row.checkedAt.getTime())
      }
    }
  }

  return [...groups.entries()]
    .map(([id, group]) => ({
      id,
      sent_at: group.sentAt ? group.sentAt.toISOString() : null,
      template: group.template,
      placements: group.placements,
      sort: group.sentAt?.getTime() ?? 0,
    }))
    .sort((a, b) => b.sort - a.sort)
    .slice(0, 12)
    .map(({ sort: _sort, ...row }) => row)
}

function listSlot(listName: string): "spamhaus" | "barracuda" | null {
  const name = listName.toLowerCase()
  if (name.includes("spamhaus")) {
    return "spamhaus"
  }
  if (name.includes("barracuda")) {
    return "barracuda"
  }
  return null
}

function listedStatus(listed: boolean | null): InboxBlocklistStatus {
  if (listed === true) {
    return "listed"
  }
  if (listed === false) {
    return "clean"
  }
  return "unknown"
}

export function summarizeBlocklists(
  rows: BlocklistSeedRow[]
): InboxBlocklistRow[] {
  const byTarget = new Map<string, InboxBlocklistRow & { checked: number }>()
  const ordered = [...rows].sort(
    (a, b) => b.checkedAt.getTime() - a.checkedAt.getTime()
  )
  for (const row of ordered) {
    const slot = listSlot(row.listName)
    if (!slot) {
      continue
    }
    let entry = byTarget.get(row.target)
    if (!entry) {
      entry = {
        target: row.target,
        spamhaus: null,
        barracuda: null,
        checked_at: row.checkedAt.toISOString(),
        checked: row.checkedAt.getTime(),
      }
      byTarget.set(row.target, entry)
    }
    if (entry[slot] == null) {
      entry[slot] = listedStatus(row.listed)
    }
    if (row.checkedAt.getTime() > entry.checked) {
      entry.checked = row.checkedAt.getTime()
      entry.checked_at = row.checkedAt.toISOString()
    }
  }
  return [...byTarget.values()]
    .map(({ checked: _checked, ...row }) => row)
    .sort((a, b) => a.target.localeCompare(b.target))
}

async function loadSeedRows(
  db: Database,
  start: Date,
  end: Date
): Promise<InboxSeedRow[]> {
  return db
    .select({
      provider: seedAccount.provider,
      placement: seedPlacementResult.placement,
      checkedAt: seedPlacementResult.checkedAt,
      messageId: message.id,
      sendId: message.sendId,
      templateName: template.name,
      sendName: send.name,
      sentAt: message.sentAt,
    })
    .from(seedPlacementResult)
    .innerJoin(
      seedAccount,
      eq(seedAccount.id, seedPlacementResult.seedAccountId)
    )
    .innerJoin(message, eq(message.id, seedPlacementResult.messageId))
    .leftJoin(send, eq(send.id, message.sendId))
    .leftJoin(
      templateVersion,
      eq(templateVersion.id, message.templateVersionId)
    )
    .leftJoin(template, eq(template.id, templateVersion.templateId))
    .where(
      and(
        gte(seedPlacementResult.checkedAt, start),
        lt(seedPlacementResult.checkedAt, end)
      )
    )
    .orderBy(desc(seedPlacementResult.checkedAt))
    .limit(ROW_LIMIT)
}

async function loadBlocklistRows(
  db: Database,
  start: Date,
  end: Date
): Promise<BlocklistSeedRow[]> {
  return db
    .select({
      target: blocklistCheck.target,
      listName: blocklistCheck.listName,
      listed: blocklistCheck.listed,
      checkedAt: blocklistCheck.checkedAt,
    })
    .from(blocklistCheck)
    .where(
      and(
        eq(blocklistCheck.targetType, "ip"),
        gte(blocklistCheck.checkedAt, start),
        lt(blocklistCheck.checkedAt, end)
      )
    )
    .orderBy(desc(blocklistCheck.checkedAt))
    .limit(ROW_LIMIT)
}

export async function getInboxPlacement(
  query: { from: string; to: string },
  db: Database = getDb(),
  now = new Date()
): Promise<InboxPlacementReport> {
  const range = getEtReportRange(query.from, query.to)
  const recentStart = new Date(now.getTime() - DAY_MS)
  const [recent, ranged, blocklists] = await Promise.all([
    loadSeedRows(db, recentStart, now),
    loadSeedRows(db, range.start, range.endExclusive),
    loadBlocklistRows(db, range.start, range.endExclusive),
  ])

  return {
    from: query.from,
    to: query.to,
    placement: summarizePlacement(recent),
    latest_sends: summarizeLatestSends(ranged),
    blocklists: summarizeBlocklists(blocklists),
  }
}
