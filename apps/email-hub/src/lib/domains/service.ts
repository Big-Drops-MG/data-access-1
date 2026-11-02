import { and, count, desc, eq, inArray, lt } from "drizzle-orm"

import {
  dnsRecord,
  domain,
  domainSetupStep,
  emailRoute,
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
  provisionSesDomainIdentity,
  SesIdentityError,
  type ProvisionedSesIdentity,
  type SesIdentityClient,
} from "@workspace/emails"
import { AppError, loadServerEnv, writeAudit } from "@workspace/shared"

import {
  domainStatusAfterCheck,
  evaluateDnsRecord,
  type DnsLookup,
} from "./check-dns"
import { createDnsLookup } from "./dns-resolver"
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
  sesRegion?: string
}

export type CheckDomainDnsDeps = {
  db?: Database
  lookup?: DnsLookup
  now?: Date
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  )
}

async function requireDomain(db: Db, id: string): Promise<Domain> {
  const [row] = await db.select().from(domain).where(eq(domain.id, id)).limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "id", message: "Domain not found" }])
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

async function countDomainsByStatus(db: Db): Promise<DomainStatusCounts> {
  const rows = await db
    .select({ status: domain.status, total: count() })
    .from(domain)
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
    countDomainsByStatus(db),
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
  id: string,
  db: Database = getDb()
): Promise<DomainDetailJson> {
  const row = await requireDomain(db, id)
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

/**
 * Provision SES first, then persist domain + DNS + setup steps in one txn.
 * SES failure → no rows (T-049 Done When).
 */
export async function createDomain(
  input: CreateDomainInput,
  actor: DomainActor,
  deps: CreateDomainDeps = {}
): Promise<DomainDetailJson> {
  const db = deps.db ?? getDb()
  const region = resolveSesRegion(deps.sesRegion)
  const provision = deps.provision ?? provisionSesDomainIdentity

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
          message: error.message,
        },
      ])
    }
    throw error
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

/**
 * Resolve every expected DNS record, persist the outcome, and move the domain
 * status and verification step to match. Resolver errors leave a record as is.
 */
export async function checkDomainDns(
  id: string,
  actor: DomainActor,
  deps: CheckDomainDnsDeps = {}
): Promise<DomainDetailJson> {
  const db = deps.db ?? getDb()
  const lookup = deps.lookup ?? createDnsLookup()
  const now = deps.now ?? new Date()

  const row = await requireDomain(db, id)
  const records = await db
    .select()
    .from(dnsRecord)
    .where(eq(dnsRecord.domainId, id))
    .orderBy(dnsRecord.id)

  const checked = await Promise.all(
    records.map(async (record) => ({
      record,
      evaluation: evaluateDnsRecord(
        record,
        await lookup({ name: record.name, recordType: record.recordType }),
        { domainCreatedAt: row.createdAt, now }
      ),
    }))
  )

  const nextRecordStatuses = checked.map(({ record, evaluation }) =>
    evaluation.status === "unchanged" ? record.status : evaluation.status
  )
  const nextStatus = domainStatusAfterCheck(row.status, nextRecordStatuses)
  const allPass =
    nextRecordStatuses.length > 0 &&
    nextRecordStatuses.every((status) => status === "pass")
  const anyChecked = checked.some(
    ({ evaluation }) => evaluation.status !== "unchanged"
  )

  await db.transaction(async (tx) => {
    for (const { record, evaluation } of checked) {
      if (evaluation.status === "unchanged") {
        continue
      }
      await tx
        .update(dnsRecord)
        .set({
          status: evaluation.status,
          lastSeenValue: evaluation.lastSeenValue,
          lastCheckedAt: now,
          updatedAt: now,
        })
        .where(eq(dnsRecord.id, record.id))
    }

    if (nextStatus !== row.status) {
      await tx
        .update(domain)
        .set({
          status: nextStatus,
          updatedAt: now,
          ...(nextStatus === "verified" && !row.verifiedAt
            ? { verifiedAt: now }
            : {}),
        })
        .where(eq(domain.id, id))
    }

    if (anyChecked) {
      await tx
        .update(domainSetupStep)
        .set({
          status: allPass ? "done" : "in_progress",
          completedAt: allPass ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(domainSetupStep.domainId, id),
            eq(domainSetupStep.step, "verification")
          )
        )
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "domain.check",
      objectType: "domain",
      objectId: id,
      requestId: actor.requestId,
      before: { status: row.status },
      after: {
        status: nextStatus,
        record_count: checked.length,
        passing_count: nextRecordStatuses.filter((status) => status === "pass")
          .length,
      },
    })
  })

  return getDomain(id, db)
}

export async function updateDomainStatus(
  id: string,
  status: Domain["status"],
  actor: DomainActor,
  db: Database = getDb()
): Promise<DomainJson> {
  return db.transaction(async (tx) => {
    const before = await requireDomain(tx, id)

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
