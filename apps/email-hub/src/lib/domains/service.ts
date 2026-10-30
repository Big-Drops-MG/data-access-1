import { and, desc, eq, lt } from "drizzle-orm"

import {
  dnsRecord,
  domain,
  domainSetupStep,
  emailRoute,
  sender,
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
  serializeDnsRecord,
  serializeDomain,
  serializeDomainSetupStep,
  type DnsRecordJson,
  type DomainJson,
  type DomainSetupStepJson,
} from "./serialize"

type Db = Database | DatabaseTransaction

export type DomainActor = {
  userId: string
  requestId?: string | null
}

export type CreateDomainDeps = {
  db?: Database
  sesClient?: SesIdentityClient
  provision?: (input: {
    domainName: string
    region: string
    client?: SesIdentityClient
  }) => Promise<ProvisionedSesIdentity>
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

export async function listDomains(
  input: {
    limit: number
    cursor?: string
    status?: Domain["status"]
  },
  db: Database = getDb()
): Promise<{ data: DomainJson[]; next_cursor: string | null }> {
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

  const rows = await db
    .select()
    .from(domain)
    .where(where)
    .orderBy(desc(domain.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  return {
    data: page.map(serializeDomain),
    next_cursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  }
}

export async function getDomain(
  id: string,
  db: Database = getDb()
): Promise<
  DomainJson & {
    dns_records: DnsRecordJson[]
    setup_steps: DomainSetupStepJson[]
  }
> {
  const row = await requireDomain(db, id)
  const [dnsRows, stepRows] = await Promise.all([
    db.select().from(dnsRecord).where(eq(dnsRecord.domainId, id)),
    db.select().from(domainSetupStep).where(eq(domainSetupStep.domainId, id)),
  ])

  return {
    ...serializeDomain(row),
    dns_records: dnsRows.map(serializeDnsRecord),
    setup_steps: stepRows.map(serializeDomainSetupStep),
  }
}

/**
 * Provision SES first, then persist domain + DNS + setup steps in one txn.
 * SES failure → no rows (T-049 Done When).
 */
export async function createDomain(
  name: string,
  actor: DomainActor,
  deps: CreateDomainDeps = {}
): Promise<
  DomainJson & {
    dns_records: DnsRecordJson[]
    setup_steps: DomainSetupStepJson[]
  }
> {
  const db = deps.db ?? getDb()
  const region = resolveSesRegion(deps.sesRegion)
  const provision = deps.provision ?? provisionSesDomainIdentity

  let provisioned: ProvisionedSesIdentity
  try {
    provisioned = await provision({
      domainName: name,
      region,
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
        ...serializeDomain(created),
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
