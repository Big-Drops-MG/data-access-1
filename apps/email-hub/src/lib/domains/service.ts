import { and, count, desc, eq, inArray, lt } from "drizzle-orm"

import {
  dnsRecord,
  domain,
  domainSetupStep,
  emailRoute,
  offer,
  sender,
  type DnsRecord,
  type Domain,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import {
  deleteSesDomainIdentity,
  provisionSesDomainIdentity,
  SesIdentityError,
  type ProvisionedSesIdentity,
  type SesIdentityClient,
} from "@workspace/emails"
import {
  AppError,
  enqueueDnsCheckJob,
  loadServerEnv,
  runDomainDnsCheck,
  writeAudit,
  type DnsLookup,
} from "@workspace/shared"

import {
  CloudflareDnsError,
  deleteCloudflareDnsRecords,
  isCloudflareDnsConfigured,
  upsertCloudflareDnsRecords,
  type CloudflareDnsDeps,
  type CloudflareDnsRecordInput,
} from "./cloudflare-dns"
import { domainScopedToOffer } from "@/lib/offer-scope"
import { getMonitoringQueue } from "@/lib/monitoring-queue"
import {
  serializeDnsRecord,
  serializeDomain,
  serializeDomainSetupStep,
  serializeDomainSummary,
  type DnsRecordJson,
  type DomainJson,
  type DomainSetupStepJson,
  type DomainSummaryJson,
} from "./serialize"

type Db = Database | DatabaseTransaction

export type DomainActor = {
  userId: string
  requestId?: string | null
}

export type DomainDetailJson = DomainSummaryJson & {
  dns_records: DnsRecordJson[]
  setup_steps: DomainSetupStepJson[]
}

export type CreateDomainInput = {
  name: string
  mailFromSubdomain?: string
  offerId?: string
}

export type CreateDomainDeps = {
  db?: Database
  sesClient?: SesIdentityClient
  provision?: (input: {
    domainName: string
    region: string
    mailFromSubdomain?: string
    client?: SesIdentityClient
  }) => Promise<ProvisionedSesIdentity>
  upsertCloudflareDns?: (
    domainName: string,
    records: readonly CloudflareDnsRecordInput[],
    deps?: CloudflareDnsDeps
  ) => Promise<{ upserted: number; zone_id: string }>
  cloudflare?: CloudflareDnsDeps
  sesRegion?: string
}

export type CheckDomainDnsDeps = {
  db?: Database
  lookup?: DnsLookup
  now?: Date
}

export type DeleteDomainResult = {
  ses_deleted: boolean
  cloudflare_deleted: boolean
}

export type DeleteDomainDeps = {
  db?: Database
  sesClient?: SesIdentityClient
  deleteIdentity?: (input: {
    domainName: string
    region: string
    client?: SesIdentityClient
  }) => Promise<{ deleted: boolean; skippedBecauseAccessDenied: boolean }>
  deleteCloudflareDns?: (
    domainName: string,
    records: readonly CloudflareDnsRecordInput[],
    deps?: CloudflareDnsDeps
  ) => Promise<{ deleted: number }>
  cloudflare?: CloudflareDnsDeps
  sesRegion?: string
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  )
}

const UUID_REF =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireDomain(db: Db, id: string): Promise<Domain> {
  const [row] = await db.select().from(domain).where(eq(domain.id, id)).limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "id", message: "Domain not found" }])
  }
  return row
}

async function requireDomainByRef(db: Db, ref: string): Promise<Domain> {
  const key = ref.trim()
  if (UUID_REF.test(key)) {
    return requireDomain(db, key)
  }
  const name = key.toLowerCase()
  const [row] = await db
    .select()
    .from(domain)
    .where(eq(domain.name, name))
    .limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "name", message: "Domain not found" }])
  }
  return row
}

function resolveSesRegion(override?: string): string {
  if (override?.trim()) {
    return override.trim()
  }
  const env = loadServerEnv("web")
  const region = env.SES_REGION?.trim()
  if (!region) {
    throw AppError.unavailable([
      {
        path: "SES_REGION",
        message: "SES_REGION is required to create a domain identity",
      },
    ])
  }
  return region
}

function configuredSesRegion(): string | null {
  try {
    return loadServerEnv("web").SES_REGION?.trim() || null
  } catch {
    return null
  }
}

async function senderCounts(
  db: Db,
  domainIds: string[]
): Promise<Map<string, number>> {
  if (domainIds.length === 0) {
    return new Map()
  }
  const rows = await db
    .select({ domainId: sender.domainId, total: count() })
    .from(sender)
    .where(inArray(sender.domainId, domainIds))
    .groupBy(sender.domainId)
  return new Map(rows.map((row) => [row.domainId, row.total]))
}

export type DomainStatusCounts = {
  all: number
  pending: number
  verifying: number
  verified: number
  failed: number
  inactive: number
}

async function countDomainsByStatus(
  db: Db,
  offerId?: string
): Promise<DomainStatusCounts> {
  const offerWhere = offerId ? domainScopedToOffer(db, offerId) : undefined
  const rows = await db
    .select({ status: domain.status, total: count() })
    .from(domain)
    .where(offerWhere)
    .groupBy(domain.status)

  const counts: DomainStatusCounts = {
    all: 0,
    pending: 0,
    verifying: 0,
    verified: 0,
    failed: 0,
    inactive: 0,
  }
  for (const row of rows) {
    counts[row.status] = row.total
    counts.all += row.total
  }
  return counts
}

export async function listDomains(
  input: {
    limit: number
    cursor?: string
    status?: Domain["status"]
    offerId?: string
  },
  db: Database = getDb()
): Promise<{
  data: DomainSummaryJson[]
  next_cursor: string | null
  status_counts: DomainStatusCounts
}> {
  const conditions = []
  if (input.status) {
    conditions.push(eq(domain.status, input.status))
  }
  if (input.offerId) {
    conditions.push(domainScopedToOffer(db, input.offerId))
  }
  if (input.cursor) {
    conditions.push(lt(domain.id, input.cursor))
  }
  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const [rows, statusCounts] = await Promise.all([
    db
      .select()
      .from(domain)
      .where(where)
      .orderBy(desc(domain.id))
      .limit(input.limit + 1),
    countDomainsByStatus(db, input.offerId),
  ])

  const page = rows.slice(0, input.limit)
  const ids = page.map((row) => row.id)

  const [dnsRows, counts] = await Promise.all([
    ids.length === 0
      ? Promise.resolve<DnsRecord[]>([])
      : db.select().from(dnsRecord).where(inArray(dnsRecord.domainId, ids)),
    senderCounts(db, ids),
  ])

  const dnsByDomain = new Map<string, DnsRecord[]>()
  for (const record of dnsRows) {
    const bucket = dnsByDomain.get(record.domainId) ?? []
    bucket.push(record)
    dnsByDomain.set(record.domainId, bucket)
  }

  const fallbackRegion = configuredSesRegion()

  return {
    data: page.map((row) =>
      serializeDomainSummary(row, {
        dnsRows: dnsByDomain.get(row.id) ?? [],
        senderCount: counts.get(row.id) ?? 0,
        fallbackRegion,
      })
    ),
    next_cursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
    status_counts: statusCounts,
  }
}

export async function getDomain(
  ref: string,
  db: Database = getDb()
): Promise<DomainDetailJson> {
  const row = await requireDomainByRef(db, ref)
  const id = row.id
  const [dnsRows, stepRows, counts] = await Promise.all([
    db
      .select()
      .from(dnsRecord)
      .where(eq(dnsRecord.domainId, id))
      .orderBy(dnsRecord.id),
    db.select().from(domainSetupStep).where(eq(domainSetupStep.domainId, id)),
    senderCounts(db, [id]),
  ])

  return {
    ...serializeDomainSummary(row, {
      dnsRows,
      senderCount: counts.get(id) ?? 0,
      fallbackRegion: configuredSesRegion(),
    }),
    dns_records: dnsRows.map(serializeDnsRecord),
    setup_steps: stepRows.map(serializeDomainSetupStep),
  }
}

export async function createDomain(
  input: CreateDomainInput,
  actor: DomainActor,
  deps: CreateDomainDeps = {}
): Promise<DomainDetailJson> {
  const db = deps.db ?? getDb()
  const region = resolveSesRegion(deps.sesRegion)
  const provision = deps.provision ?? provisionSesDomainIdentity
  const writeCloudflareDns =
    deps.upsertCloudflareDns ?? upsertCloudflareDnsRecords

  let offerId: string | null = null
  if (input.offerId) {
    const [offerRow] = await db
      .select({ id: offer.id })
      .from(offer)
      .where(eq(offer.id, input.offerId))
      .limit(1)
    if (!offerRow) {
      throw AppError.validationFailed([
        { path: "offer_id", message: "Offer not found" },
      ])
    }
    offerId = offerRow.id
  }

  let provisioned: ProvisionedSesIdentity
  try {
    provisioned = await provision({
      domainName: input.name,
      region,
      mailFromSubdomain: input.mailFromSubdomain,
      client: deps.sesClient,
    })
  } catch (error) {
    if (error instanceof SesIdentityError) {
      throw AppError.unavailable([
        {
          path: "ses",
          message: error.message || "Amazon SES is unavailable",
        },
      ])
    }
    throw error
  }

  if (isCloudflareDnsConfigured(deps.cloudflare)) {
    try {
      await writeCloudflareDns(
        provisioned.emailIdentity,
        provisioned.dnsRecords,
        deps.cloudflare
      )
    } catch (error) {
      if (error instanceof CloudflareDnsError) {
        throw AppError.unavailable([
          {
            path: "cloudflare",
            message: error.message || "Cloudflare DNS is unavailable",
          },
        ])
      }
      throw error
    }
  }

  const now = new Date()

  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(domain)
        .values({
          name: provisioned.emailIdentity,
          status: "pending",
          sesIdentityArn: provisioned.identityArn,
          offerId,
          createdBy: actor.userId,
        })
        .returning()

      if (!created) {
        throw AppError.internal()
      }

      const dnsInserted = await tx
        .insert(dnsRecord)
        .values(
          provisioned.dnsRecords.map((record) => ({
            domainId: created.id,
            purpose: record.purpose,
            name: record.name,
            recordType: record.recordType,
            expectedValue: record.expectedValue,
            status: "pending" as const,
          }))
        )
        .returning()

      const stepsInserted = await tx
        .insert(domainSetupStep)
        .values([
          {
            domainId: created.id,
            step: "ses_identity",
            status: "done",
            startedAt: now,
            completedAt: now,
          },
          {
            domainId: created.id,
            step: "dns_records",
            status: "done",
            startedAt: now,
            completedAt: now,
          },
          {
            domainId: created.id,
            step: "verification",
            status: "pending",
          },
        ])
        .returning()

      await writeAudit(tx, {
        actor: { type: "user", id: actor.userId },
        action: "domain.create",
        objectType: "domain",
        objectId: created.id,
        requestId: actor.requestId,
        after: {
          ...serializeDomain(created),
          dns_record_count: dnsInserted.length,
          mail_from_domain: provisioned.mailFromDomain,
        },
      })

      return {
        ...serializeDomainSummary(created, {
          dnsRows: dnsInserted,
          senderCount: 0,
          fallbackRegion: region,
        }),
        dns_records: dnsInserted.map(serializeDnsRecord),
        setup_steps: stepsInserted.map(serializeDomainSetupStep),
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict([
        { path: "name", message: "A domain with this name already exists" },
      ])
    }
    throw error
  }
}

export type EnqueueDomainDnsCheckResult = {
  status: "queued"
  domain_id: string
}

export async function enqueueDomainDnsCheck(
  ref: string,
  actor: DomainActor,
  deps: { db?: Database } = {}
): Promise<EnqueueDomainDnsCheckResult> {
  const db = deps.db ?? getDb()
  const row = await requireDomainByRef(db, ref)
  await enqueueDnsCheckJob(getMonitoringQueue(), {
    domainId: row.id,
    trigger: "manual",
    requestId: actor.requestId ?? undefined,
  })
  return { status: "queued", domain_id: row.id }
}

export async function checkDomainDns(
  ref: string,
  actor: DomainActor,
  deps: CheckDomainDnsDeps = {}
): Promise<DomainDetailJson> {
  const db = deps.db ?? getDb()
  const row = await requireDomainByRef(db, ref)
  await runDomainDnsCheck(row.id, {
    db,
    lookup: deps.lookup,
    now: deps.now,
    actor: { type: "user", id: actor.userId },
    requestId: actor.requestId,
  })
  return getDomain(row.id, db)
}

export async function updateDomainStatus(
  ref: string,
  status: Domain["status"],
  actor: DomainActor,
  db: Database = getDb()
): Promise<DomainJson> {
  return db.transaction(async (tx) => {
    const before = await requireDomainByRef(tx, ref)
    const id = before.id

    if (status === "inactive" && before.status !== "inactive") {
      const [activeSender] = await tx
        .select({ id: sender.id })
        .from(sender)
        .where(and(eq(sender.domainId, id), eq(sender.status, "active")))
        .limit(1)
      if (activeSender) {
        throw AppError.conflict([
          {
            path: "sender",
            message: activeSender.id,
          },
        ])
      }

      const activeRoutes = await tx
        .select({ id: emailRoute.id })
        .from(emailRoute)
        .innerJoin(sender, eq(emailRoute.senderId, sender.id))
        .where(and(eq(sender.domainId, id), eq(emailRoute.status, "active")))
      if (activeRoutes.length > 0) {
        throw AppError.conflict(
          activeRoutes.map((route) => ({
            path: "email_route",
            message: route.id,
          }))
        )
      }
    }

    const [updated] = await tx
      .update(domain)
      .set({
        status,
        updatedAt: new Date(),
        ...(status === "verified" && !before.verifiedAt
          ? { verifiedAt: new Date() }
          : {}),
      })
      .where(eq(domain.id, id))
      .returning()

    if (!updated) {
      throw AppError.notFound([{ path: "id", message: "Domain not found" }])
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "domain.update",
      objectType: "domain",
      objectId: updated.id,
      requestId: actor.requestId,
      before: serializeDomain(before),
      after: serializeDomain(updated),
    })

    return serializeDomain(updated)
  })
}

export async function deleteDomain(
  ref: string,
  actor: DomainActor,
  deps: DeleteDomainDeps = {}
): Promise<DeleteDomainResult> {
  const db = deps.db ?? getDb()
  const region = resolveSesRegion(deps.sesRegion)
  const removeIdentity = deps.deleteIdentity ?? deleteSesDomainIdentity

  const before = await requireDomainByRef(db, ref)
  const id = before.id

  const [linkedSender] = await db
    .select({ id: sender.id })
    .from(sender)
    .where(eq(sender.domainId, id))
    .limit(1)
  if (linkedSender) {
    throw AppError.conflict([
      {
        path: "sender",
        message: linkedSender.id,
      },
    ])
  }

  const dnsRows = await db
    .select()
    .from(dnsRecord)
    .where(eq(dnsRecord.domainId, id))
    .orderBy(dnsRecord.id)

  let sesDeleted = true
  try {
    const sesResult = await removeIdentity({
      domainName: before.name,
      region,
      client: deps.sesClient,
    })
    sesDeleted = sesResult.deleted
  } catch (error) {
    if (error instanceof SesIdentityError) {
      throw AppError.unavailable([
        {
          path: "ses",
          message: error.message || "Amazon SES is unavailable",
        },
      ])
    }
    throw error
  }

  const removeCloudflareDns =
    deps.deleteCloudflareDns ?? deleteCloudflareDnsRecords
  let cloudflareDeleted = dnsRows.length === 0
  try {
    await removeCloudflareDns(
      before.name,
      dnsRows.map((row) => ({
        purpose: row.purpose,
        name: row.name,
        recordType: row.recordType,
        expectedValue: row.expectedValue,
      })),
      deps.cloudflare
    )
    cloudflareDeleted = true
  } catch (error) {
    if (!(error instanceof CloudflareDnsError)) {
      throw error
    }
    cloudflareDeleted = false
  }

  await db.transaction(async (tx) => {
    const stillThere = await requireDomainByRef(tx, id)

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "domain.delete",
      objectType: "domain",
      objectId: stillThere.id,
      requestId: actor.requestId,
      before: serializeDomain(stillThere),
      after: {
        ses_deleted: sesDeleted,
        cloudflare_deleted: cloudflareDeleted,
      },
    })

    await tx.delete(domain).where(eq(domain.id, stillThere.id))
  })

  return {
    ses_deleted: sesDeleted,
    cloudflare_deleted: cloudflareDeleted,
  }
}
