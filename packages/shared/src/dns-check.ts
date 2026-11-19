import { and, eq, ne } from "drizzle-orm"
import type { Queue } from "bullmq"

import { dnsRecord, domain, domainSetupStep, type Domain } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"

import { closeAlert, openAlert } from "./alerts.js"
import { writeAudit, type AuditActor } from "./audit.js"
import {
  DNS_PROPAGATION_WINDOW_MS,
  domainStatusAfterCheck,
  evaluateDnsRecord,
  type DnsLookup,
} from "./check-dns.js"
import { createDnsLookup } from "./dns-resolver.js"
import {
  DNS_CHECK_JOB_NAME,
  enqueueDnsCheckJob,
  type DnsCheckJobData,
  type DnsCheckTrigger,
} from "./dns-check-queue.js"
import { AppError } from "./errors.js"
import { uuidSchema } from "./schemas.js"

export { DNS_CHECK_JOB_NAME }

export const DNS_CHECK_FAILED_ALERT_TYPE = "dns_check_failed" as const
export const DOMAIN_PENDING_72H_ALERT_TYPE = "domain_pending_72h" as const

export function dnsCheckFailedAlertDedupeKey(domainId: string): string {
  return `dns_check_failed:${domainId}`
}

export function domainPending72hAlertDedupeKey(domainId: string): string {
  return `domain_pending_72h:${domainId}`
}

export type SesIdentityVerifiedLookup = (
  domainName: string
) => Promise<boolean | null>

export type RunDomainDnsCheckDeps = {
  db: Database
  lookup?: DnsLookup
  now?: Date
  getSesIdentityVerified?: SesIdentityVerifiedLookup
  actor?: AuditActor
  requestId?: string | null
}

export type RunDomainDnsCheckResult = {
  domainId: string
  domainName: string
  previousStatus: Domain["status"]
  status: Domain["status"]
  allPass: boolean
  recordCount: number
  passingCount: number
  sesIdentityVerified: boolean | null
}

export type ProcessDnsCheckJobDeps = {
  db: Database
  monitoringQueue: Pick<Queue<DnsCheckJobData>, "add" | "getJob">
  lookup?: DnsLookup
  now?: Date
  getSesIdentityVerified?: SesIdentityVerifiedLookup
}

export type ProcessDnsCheckJobResult =
  | { kind: "fanout"; enqueued: number }
  | { kind: "domain"; result: RunDomainDnsCheckResult }
  | { kind: "skipped"; reason: "missing_domain" | "inactive" }

function resolveActor(deps: RunDomainDnsCheckDeps): AuditActor {
  return deps.actor ?? { type: "system" }
}

async function syncDnsAlerts(
  db: Database | DatabaseTransaction,
  input: {
    domainId: string
    domainName: string
    previousStatus: Domain["status"]
    status: Domain["status"]
    createdAt: Date
    now: Date
    allPass: boolean
  }
): Promise<void> {
  const failedKey = dnsCheckFailedAlertDedupeKey(input.domainId)
  const pendingKey = domainPending72hAlertDedupeKey(input.domainId)

  if (input.status === "failed") {
    await openAlert(db, {
      type: DNS_CHECK_FAILED_ALERT_TYPE,
      severity: "warning",
      dedupeKey: failedKey,
      payload: {
        domain_id: input.domainId,
        domain_name: input.domainName,
        previous_status: input.previousStatus,
      },
      now: input.now,
      refreshPayload: true,
    })
  } else {
    await closeAlert(db, {
      type: DNS_CHECK_FAILED_ALERT_TYPE,
      dedupeKey: failedKey,
      now: input.now,
    })
  }

  const ageMs = input.now.getTime() - input.createdAt.getTime()
  const stillPending =
    (input.status === "pending" || input.status === "verifying") &&
    !input.allPass &&
    ageMs >= DNS_PROPAGATION_WINDOW_MS

  if (stillPending) {
    await openAlert(db, {
      type: DOMAIN_PENDING_72H_ALERT_TYPE,
      severity: "warning",
      dedupeKey: pendingKey,
      payload: {
        domain_id: input.domainId,
        domain_name: input.domainName,
        age_hours: Math.floor(ageMs / (60 * 60 * 1000)),
      },
      now: input.now,
      refreshPayload: true,
    })
  } else {
    await closeAlert(db, {
      type: DOMAIN_PENDING_72H_ALERT_TYPE,
      dedupeKey: pendingKey,
      now: input.now,
    })
  }
}

async function updateSetupSteps(
  tx: DatabaseTransaction,
  input: {
    domainId: string
    allPass: boolean
    status: Domain["status"]
    now: Date
    anyChecked: boolean
  }
): Promise<void> {
  if (!input.anyChecked) {
    return
  }

  const verificationStatus =
    input.status === "verified"
      ? "done"
      : input.status === "failed"
        ? "failed"
        : "in_progress"

  await tx
    .update(domainSetupStep)
    .set({
      status: verificationStatus,
      completedAt: verificationStatus === "done" ? input.now : null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(domainSetupStep.domainId, input.domainId),
        eq(domainSetupStep.step, "verification")
      )
    )

  if (input.allPass) {
    await tx
      .update(domainSetupStep)
      .set({
        status: "done",
        completedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(domainSetupStep.domainId, input.domainId),
          eq(domainSetupStep.step, "dns_records")
        )
      )
  } else if (input.status === "failed") {
    await tx
      .update(domainSetupStep)
      .set({
        status: "failed",
        completedAt: null,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(domainSetupStep.domainId, input.domainId),
          eq(domainSetupStep.step, "dns_records")
        )
      )
  }
}

export async function runDomainDnsCheck(
  domainId: string,
  deps: RunDomainDnsCheckDeps
): Promise<RunDomainDnsCheckResult> {
  const id = uuidSchema.parse(domainId)
  const db = deps.db
  const lookup = deps.lookup ?? createDnsLookup()
  const now = deps.now ?? new Date()

  const [row] = await db.select().from(domain).where(eq(domain.id, id)).limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "id", message: "Domain not found" }])
  }

  if (row.status === "inactive") {
    return {
      domainId: row.id,
      domainName: row.name,
      previousStatus: row.status,
      status: row.status,
      allPass: false,
      recordCount: 0,
      passingCount: 0,
      sesIdentityVerified: null,
    }
  }

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
  const allPass =
    nextRecordStatuses.length > 0 &&
    nextRecordStatuses.every((status) => status === "pass")

  let sesIdentityVerified: boolean | null = null
  if (deps.getSesIdentityVerified && allPass) {
    try {
      sesIdentityVerified = await deps.getSesIdentityVerified(row.name)
    } catch (error) {
      getContextLogger().warn(
        {
          event: "dns_check.ses_identity_lookup_failed",
          domain_id: row.id,
          err: error,
        },
        "SES identity lookup failed during dns-check"
      )
      sesIdentityVerified = null
    }
  }

  const nextStatus = domainStatusAfterCheck(
    row.status,
    nextRecordStatuses,
    sesIdentityVerified
  )
  const anyChecked = checked.some(
    ({ evaluation }) => evaluation.status !== "unchanged"
  )
  const passingCount = nextRecordStatuses.filter(
    (status) => status === "pass"
  ).length
  const actor = resolveActor(deps)
  const requestId = deps.requestId ?? null

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

    await updateSetupSteps(tx, {
      domainId: id,
      allPass,
      status: nextStatus,
      now,
      anyChecked,
    })

    await syncDnsAlerts(tx, {
      domainId: id,
      domainName: row.name,
      previousStatus: row.status,
      status: nextStatus,
      createdAt: row.createdAt,
      now,
      allPass,
    })

    await writeAudit(tx, {
      actor,
      action: "domain.check",
      objectType: "domain",
      objectId: id,
      requestId,
      before: { status: row.status },
      after: {
        status: nextStatus,
        record_count: checked.length,
        passing_count: passingCount,
        ses_identity_verified: sesIdentityVerified,
      },
    })
  })

  return {
    domainId: row.id,
    domainName: row.name,
    previousStatus: row.status,
    status: nextStatus,
    allPass,
    recordCount: checked.length,
    passingCount,
    sesIdentityVerified,
  }
}

export async function processDnsCheckJob(
  data: DnsCheckJobData,
  deps: ProcessDnsCheckJobDeps
): Promise<ProcessDnsCheckJobResult> {
  const domainId = data.domain_id?.trim()
  const trigger: DnsCheckTrigger = data.trigger ?? "scheduled"
  const now = deps.now ?? new Date()

  if (!domainId) {
    const rows = await deps.db
      .select({ id: domain.id })
      .from(domain)
      .where(ne(domain.status, "inactive"))

    let enqueued = 0
    for (const row of rows) {
      await enqueueDnsCheckJob(deps.monitoringQueue, {
        domainId: row.id,
        trigger: "scheduled",
        requestId: data.request_id,
        now,
      })
      enqueued += 1
    }

    getContextLogger().info(
      {
        event: "dns_check.fanout",
        enqueued,
      },
      "dns-check scheduled fan-out"
    )
    return { kind: "fanout", enqueued }
  }

  const [row] = await deps.db
    .select({ id: domain.id, status: domain.status })
    .from(domain)
    .where(eq(domain.id, domainId))
    .limit(1)

  if (!row) {
    getContextLogger().warn(
      { event: "dns_check.missing_domain", domain_id: domainId },
      "dns-check skipped; domain missing"
    )
    return { kind: "skipped", reason: "missing_domain" }
  }

  if (row.status === "inactive") {
    return { kind: "skipped", reason: "inactive" }
  }

  const result = await runDomainDnsCheck(domainId, {
    db: deps.db,
    lookup: deps.lookup,
    now,
    getSesIdentityVerified: deps.getSesIdentityVerified,
    requestId: data.request_id,
    actor: { type: "system" },
  })

  getContextLogger().info(
    {
      event: "dns_check.completed",
      domain_id: result.domainId,
      trigger,
      status: result.status,
      previous_status: result.previousStatus,
      passing_count: result.passingCount,
      record_count: result.recordCount,
      ses_identity_verified: result.sesIdentityVerified,
    },
    "dns-check completed"
  )

  return { kind: "domain", result }
}
