import { createHash, randomBytes } from "node:crypto"

import { eq } from "drizzle-orm"

import { unsubscribeSettings, type UnsubscribeSettings } from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import {
  AppError,
  isAppError,
  loadServerEnv,
  resolveUnsubscribeOrigin,
} from "@workspace/shared"

import type { DnsLookup } from "@/lib/domains/check-dns"
import { createDnsLookup } from "@/lib/domains/dns-resolver"

import type {
  UnsubscribeDnsRecordJson,
  UnsubscribeSettingsJson,
} from "./serialize"

export type UnsubscribeSettingsActor = {
  userId: string
}

export type PatchUnsubscribeSettingsInput = {
  logoUrl?: string | null
  customDomain?: string | null
}

const TXT_PREFIX = "_eh-unsubscribe"

function hubHostFromOrigin(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return ""
  }
}

function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^https?:\/\//, "")
    .split("/")[0]!
}

function mintVerificationToken(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex").slice(0, 32)
}

function dnsRecordsFor(
  domain: string | null,
  token: string | null,
  hubHost: string
): UnsubscribeDnsRecordJson[] {
  if (!domain || !token) {
    return []
  }
  return [
    { type: "CNAME", host: domain, value: hubHost },
    {
      type: "TXT",
      host: `${TXT_PREFIX}.${domain}`,
      value: token,
    },
  ]
}

function publicBaseUrl(
  row: UnsubscribeSettings,
  fallbackOrigin: string
): string {
  if (row.customDomainStatus === "verified" && row.customDomain) {
    return `https://${row.customDomain}`
  }
  return fallbackOrigin.replace(/\/+$/, "")
}

export function serializeUnsubscribeSettings(
  row: UnsubscribeSettings,
  options: { fallbackOrigin: string }
): UnsubscribeSettingsJson {
  const hubHost = hubHostFromOrigin(options.fallbackOrigin)
  return {
    id: row.id,
    logo_url: row.logoUrl,
    custom_domain: row.customDomain,
    custom_domain_status: row.customDomainStatus,
    verification_token: row.verificationToken,
    verified_at: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    public_base_url: publicBaseUrl(row, options.fallbackOrigin),
    hub_host: hubHost,
    dns_records: dnsRecordsFor(
      row.customDomain,
      row.verificationToken,
      hubHost
    ),
    updated_at: row.updatedAt.toISOString(),
  }
}

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "42P01"
  )
}

export async function ensureUnsubscribeSettings(
  db: Database = getDb()
): Promise<UnsubscribeSettings> {
  try {
    const [existing] = await db.select().from(unsubscribeSettings).limit(1)
    if (existing) {
      return existing
    }
    const [created] = await db
      .insert(unsubscribeSettings)
      .values({})
      .returning()
    if (!created) {
      throw AppError.unavailable([
        { path: "unsubscribe_settings", message: "Could not create settings" },
      ])
    }
    return created
  } catch (error) {
    if (isAppError(error)) {
      throw error
    }
    if (isUndefinedTableError(error)) {
      throw AppError.unavailable([
        {
          path: "unsubscribe_settings",
          message:
            "unsubscribe_settings is missing — run Postgres migrations (0019_unsubscribe_settings)",
        },
      ])
    }
    throw error
  }
}

export async function getUnsubscribeSettings(
  db: Database = getDb()
): Promise<UnsubscribeSettingsJson> {
  const env = loadServerEnv("web")
  const row = await ensureUnsubscribeSettings(db)
  return serializeUnsubscribeSettings(row, {
    fallbackOrigin: env.BETTER_AUTH_URL,
  })
}

export async function patchUnsubscribeSettings(
  input: PatchUnsubscribeSettingsInput,
  actor: UnsubscribeSettingsActor,
  db: Database = getDb()
): Promise<UnsubscribeSettingsJson> {
  const env = loadServerEnv("web")
  const current = await ensureUnsubscribeSettings(db)
  const now = new Date()

  let logoUrl = current.logoUrl
  if (input.logoUrl !== undefined) {
    logoUrl = input.logoUrl
  }

  let customDomain = current.customDomain
  let customDomainStatus = current.customDomainStatus
  let verificationToken = current.verificationToken
  let verifiedAt = current.verifiedAt

  if (input.customDomain !== undefined) {
    if (input.customDomain === null) {
      customDomain = null
      customDomainStatus = "unset"
      verificationToken = null
      verifiedAt = null
    } else {
      const host = normalizeHostname(input.customDomain)
      const hubHost = hubHostFromOrigin(env.BETTER_AUTH_URL)
      if (host === "" || host === hubHost) {
        throw AppError.validationFailed([
          {
            path: "custom_domain",
            message: "Custom domain must differ from the Hub host",
          },
        ])
      }
      customDomain = host
      customDomainStatus = "pending"
      verificationToken = mintVerificationToken()
      verifiedAt = null
    }
  }

  const [updated] = await db
    .update(unsubscribeSettings)
    .set({
      logoUrl,
      customDomain,
      customDomainStatus,
      verificationToken,
      verifiedAt,
      updatedBy: actor.userId,
      updatedAt: now,
    })
    .where(eq(unsubscribeSettings.id, current.id))
    .returning()

  if (!updated) {
    throw AppError.notFound()
  }

  return serializeUnsubscribeSettings(updated, {
    fallbackOrigin: env.BETTER_AUTH_URL,
  })
}

export async function verifyUnsubscribeCustomDomain(
  options: {
    lookup?: DnsLookup
    now?: Date
  } = {},
  db: Database = getDb()
): Promise<UnsubscribeSettingsJson> {
  const env = loadServerEnv("web")
  const current = await ensureUnsubscribeSettings(db)
  if (!current.customDomain || !current.verificationToken) {
    throw AppError.validationFailed([
      {
        path: "custom_domain",
        message: "Bind a custom domain before verifying",
      },
    ])
  }

  const hubHost = hubHostFromOrigin(env.BETTER_AUTH_URL)
  if (hubHost === "") {
    throw AppError.unavailable([
      { path: "BETTER_AUTH_URL", message: "Hub origin is not configured" },
    ])
  }

  const lookup = options.lookup ?? createDnsLookup()
  const now = options.now ?? new Date()

  const cname = await lookup({
    name: current.customDomain,
    recordType: "CNAME",
  })
  const txt = await lookup({
    name: `${TXT_PREFIX}.${current.customDomain}`,
    recordType: "TXT",
  })

  const cnameOk =
    cname.kind === "found" &&
    cname.values.some(
      (value) =>
        value.trim().toLowerCase().replace(/\.$/, "") ===
        hubHost.replace(/\.$/, "")
    )
  const txtOk =
    txt.kind === "found" &&
    txt.values.some((value) => value.trim() === current.verificationToken)

  const verified = cnameOk && txtOk
  const nextStatus = verified
    ? ("verified" as const)
    : cname.kind === "error" || txt.kind === "error"
      ? ("pending" as const)
      : ("failed" as const)

  const [updated] = await db
    .update(unsubscribeSettings)
    .set({
      customDomainStatus: nextStatus,
      verifiedAt: verified ? now : null,
      updatedAt: now,
    })
    .where(eq(unsubscribeSettings.id, current.id))
    .returning()

  if (!updated) {
    throw AppError.notFound()
  }

  return serializeUnsubscribeSettings(updated, {
    fallbackOrigin: env.BETTER_AUTH_URL,
  })
}

export async function getPublicUnsubscribeLogoUrl(
  db: Database = getDb()
): Promise<string | null> {
  try {
    const [row] = await db.select().from(unsubscribeSettings).limit(1)
    return row?.logoUrl ?? null
  } catch {
    return null
  }
}

export { resolveUnsubscribeOrigin }
