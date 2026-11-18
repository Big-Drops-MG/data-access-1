import { message, session, trustedDevice, verification } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import { count, lt, sql } from "drizzle-orm"

export const CLEANUP_EXPIRED_JOB_NAME = "cleanup-expired"
export const RETENTION_MONTHS = 24

export type CleanupExpiredDeps = {
  db: Database
  now?: () => Date
  purgeAuditBefore?: (cutoff: Date) => Promise<number>
}

function retentionCutoff(now: Date): Date {
  const cutoff = new Date(now.getTime())
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS)
  return cutoff
}

async function defaultPurgeAudit(db: Database, cutoff: Date): Promise<number> {
  const result = await db.execute(
    sql`SELECT public.purge_audit_log_before(${cutoff}) AS deleted`
  )
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: { deleted?: unknown }[] }).rows ?? [])
  return Number((rows[0] as { deleted?: unknown } | undefined)?.deleted ?? 0)
}

export async function processCleanupExpiredJob(
  deps: CleanupExpiredDeps
): Promise<void> {
  const now = deps.now?.() ?? new Date()
  const logger = getContextLogger()
  const cutoff = retentionCutoff(now)
  const purgeAudit =
    deps.purgeAuditBefore ??
    ((before: Date) => defaultPurgeAudit(deps.db, before))

  const sessions = await deps.db
    .delete(session)
    .where(lt(session.expiresAt, now))
    .returning({ id: session.id })
  const verifications = await deps.db
    .delete(verification)
    .where(lt(verification.expiresAt, now))
    .returning({ id: verification.id })
  const devices = await deps.db
    .delete(trustedDevice)
    .where(lt(trustedDevice.expiresAt, now))
    .returning({ id: trustedDevice.id })

  const [messageCountRow] = await deps.db
    .select({ value: count() })
    .from(message)
    .where(lt(message.createdAt, cutoff))
  await deps.db.delete(message).where(lt(message.createdAt, cutoff))
  const auditDeleted = await purgeAudit(cutoff)

  logger.info(
    {
      event: "cleanup_expired.completed",
      sessions_deleted: sessions.length,
      verifications_deleted: verifications.length,
      trusted_devices_deleted: devices.length,
      messages_deleted: Number(messageCountRow?.value ?? 0),
      audit_deleted: auditDeleted,
      retention_cutoff: cutoff.toISOString(),
    },
    "Cleanup expired completed"
  )
}
