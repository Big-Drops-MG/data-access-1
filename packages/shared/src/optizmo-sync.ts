import { parse } from "csv-parse"
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm"
import type { Queue } from "bullmq"

import {
  offer,
  recipient,
  suppressionEntry,
  suppressionSyncRun,
} from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"

import {
  AppEncryptionError,
  decryptWithAppKey,
  readAppEncryptionKeyFromEnv,
} from "./app-encryption.js"
import { closeAlert, openAlert } from "./alerts.js"
import { hashEmail, normaliseEmail } from "./email.js"
import {
  recordIntegrationResult,
  sanitizeIntegrationError,
} from "./integration-sync-state.js"
import {
  OptizmoClientError,
  prepareOptizmoDownload,
  streamOptizmoSuppressionFile,
  type OptizmoClientDeps,
  type OptizmoFetch,
} from "./optizmo-client.js"
import {
  enqueueOptizmoSyncJob,
  OPTIZMO_SYNC_JOB_NAME,
  type OptizmoSyncJobData,
  type OptizmoSyncTrigger,
} from "./optizmo-queue.js"
import { emailSchema, uuidSchema } from "./schemas.js"

export const OPTIZMO_SYNC_ALERT_TYPE = "optizmo_sync_failed" as const
export const OPTIZMO_FIRST_DOWNLOAD_ALERT_TYPE =
  "optizmo_first_download_manual" as const
export const OPTIZMO_INTEGRATION_NAME = "optizmo" as const
export const OPTIZMO_SYNC_CHUNK_SIZE = 500

export { OPTIZMO_SYNC_JOB_NAME }

export function optizmoSyncAlertDedupeKey(offerId: string): string {
  return `optizmo_sync:${offerId}`
}

export function optizmoFirstDownloadAlertDedupeKey(offerId: string): string {
  return `optizmo_first:${offerId}`
}

export type OptizmoSyncEnv = {
  OPTIZMO_API_KEY?: string
  OPTIZMO_API_BASE_URL?: string
  APP_ENCRYPTION_KEY?: string
}

export type ProcessOptizmoSyncDeps = {
  db: Database
  env: OptizmoSyncEnv
  syncQueue?: Pick<Queue<OptizmoSyncJobData>, "add" | "getJob">
  fetchImpl?: OptizmoFetch
  encryptionKey?: string
  now?: Date
  permanentFailure?: (message: string) => Error
}

export type OptizmoSyncResult =
  | { kind: "fanout"; enqueued: number }
  | {
      kind: "offer"
      offerId: string
      rowsAdded: number
      rowsRemoved: number
      emailsSeen: number
    }

class OptizmoPermanentFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OptizmoPermanentFailure"
  }
}

function throwPermanent(deps: ProcessOptizmoSyncDeps, message: string): never {
  if (deps.permanentFailure) {
    throw deps.permanentFailure(message)
  }
  throw new OptizmoPermanentFailure(message)
}

function isPermanentFailure(
  error: unknown,
  deps: ProcessOptizmoSyncDeps
): boolean {
  if (error instanceof OptizmoPermanentFailure) {
    return true
  }
  if (error instanceof Error && error.name === "UnrecoverableError") {
    return true
  }
  if (deps.permanentFailure && error instanceof Error) {
    try {
      const sample = deps.permanentFailure("probe")
      return error.name === sample.name
    } catch {
      return false
    }
  }
  return false
}

function clientDeps(
  env: OptizmoSyncEnv,
  fetchImpl?: OptizmoFetch
): OptizmoClientDeps {
  const apiKey = env.OPTIZMO_API_KEY?.trim() ?? ""
  return {
    apiKey,
    ...(env.OPTIZMO_API_BASE_URL ? { baseUrl: env.OPTIZMO_API_BASE_URL } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  }
}

export function collectEmailsFromCsvChunk(
  records: string[][],
  emailColumnIndex: number | null
): string[] {
  const emails: string[] = []
  for (const record of records) {
    const raw =
      emailColumnIndex === null
        ? record[0]
        : (record[emailColumnIndex] ?? record[0])
    if (typeof raw !== "string") {
      continue
    }
    const normalised = normaliseEmail(raw)
    if (!emailSchema.safeParse(normalised).success) {
      continue
    }
    emails.push(normalised)
  }
  return emails
}

export async function parseOptizmoEmailStream(
  stream: NodeJS.ReadableStream
): Promise<Set<string>> {
  const emails = new Set<string>()
  let headerResolved = false
  let emailColumnIndex: number | null = null

  const parser = stream.pipe(
    parse({
      relax_column_count: true,
      trim: true,
      skip_empty_lines: true,
    })
  )

  for await (const record of parser as AsyncIterable<string[]>) {
    if (!headerResolved) {
      headerResolved = true
      const lowered = record.map((cell) => cell.trim().toLowerCase())
      const idx = lowered.findIndex((cell) => cell === "email")
      if (idx >= 0) {
        emailColumnIndex = idx
        continue
      }
      emailColumnIndex = null
    }
    for (const email of collectEmailsFromCsvChunk([record], emailColumnIndex)) {
      emails.add(email)
    }
  }

  return emails
}

async function markSyncFailed(
  db: Database,
  syncRunId: string,
  error: string,
  now: Date
): Promise<void> {
  await db
    .update(suppressionSyncRun)
    .set({
      status: "failed",
      finishedAt: now,
      error,
    })
    .where(eq(suppressionSyncRun.id, syncRunId))
}

async function failOfferSync(
  db: Database,
  input: {
    syncRunId: string
    offerId: string
    message: string
    now: Date
    firstDownload?: boolean
  }
): Promise<void> {
  const safeMessage =
    sanitizeIntegrationError(input.message) ?? "Optizmo sync failed"
  await markSyncFailed(db, input.syncRunId, safeMessage, input.now)
  if (input.firstDownload) {
    await openAlert(db, {
      type: OPTIZMO_FIRST_DOWNLOAD_ALERT_TYPE,
      severity: "warning",
      dedupeKey: optizmoFirstDownloadAlertDedupeKey(input.offerId),
      payload: {
        offer_id: input.offerId,
        reason: safeMessage,
      },
      now: input.now,
    })
  } else {
    await openAlert(db, {
      type: OPTIZMO_SYNC_ALERT_TYPE,
      severity: "warning",
      dedupeKey: optizmoSyncAlertDedupeKey(input.offerId),
      payload: {
        offer_id: input.offerId,
        reason: safeMessage,
      },
      now: input.now,
    })
  }
  await recordIntegrationResult(db, {
    name: OPTIZMO_INTEGRATION_NAME,
    ok: false,
    error: safeMessage,
    now: input.now,
  })
}

async function upsertOptizmoEmails(
  db: Database,
  offerId: string,
  syncRunId: string,
  emails: Set<string>
): Promise<{ rowsAdded: number; rowsRemoved: number }> {
  const hashes = [...emails].map((email) => hashEmail(email))
  const hashSet = new Set(hashes)
  let rowsAdded = 0

  const recipientRows =
    hashes.length === 0
      ? []
      : await db
          .select({ id: recipient.id, emailHash: recipient.emailHash })
          .from(recipient)
          .where(inArray(recipient.emailHash, hashes))
  const recipientByHash = new Map(
    recipientRows.map((row) => [row.emailHash, row.id] as const)
  )

  for (let i = 0; i < hashes.length; i += OPTIZMO_SYNC_CHUNK_SIZE) {
    const chunk = hashes.slice(i, i + OPTIZMO_SYNC_CHUNK_SIZE)
    const values = chunk.map((emailHash) => ({
      emailHash,
      recipientId: recipientByHash.get(emailHash) ?? null,
      scope: "offer" as const,
      offerId,
      source: "optizmo" as const,
      syncRunId,
    }))
    const inserted = await db
      .insert(suppressionEntry)
      .values(values)
      .onConflictDoNothing({
        target: [
          suppressionEntry.emailHash,
          suppressionEntry.scope,
          suppressionEntry.offerId,
        ],
        where: sql`${suppressionEntry.removedAt} IS NULL AND ${suppressionEntry.offerId} IS NOT NULL`,
      })
      .returning({ id: suppressionEntry.id })
    rowsAdded += inserted.length
  }

  const removed = await db
    .update(suppressionEntry)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(suppressionEntry.offerId, offerId),
        eq(suppressionEntry.scope, "offer"),
        eq(suppressionEntry.source, "optizmo"),
        isNull(suppressionEntry.removedAt),
        notInArray(suppressionEntry.emailHash, [...hashSet])
      )
    )
    .returning({ id: suppressionEntry.id })

  return { rowsAdded, rowsRemoved: removed.length }
}

async function syncOneOffer(
  offerId: string,
  trigger: OptizmoSyncTrigger,
  deps: ProcessOptizmoSyncDeps
): Promise<Extract<OptizmoSyncResult, { kind: "offer" }>> {
  const db = deps.db
  const now = deps.now ?? new Date()
  const logger = getContextLogger()
  const started = Date.now()

  const [row] = await db
    .select()
    .from(offer)
    .where(eq(offer.id, offerId))
    .limit(1)

  if (!row) {
    throwPermanent(deps, "Offer not found")
  }
  if (row.status !== "active") {
    throwPermanent(deps, "Offer is not active")
  }
  if (!row.hasOptizmoMailerAccessKey || !row.optizmoMailerAccessKeyEncrypted) {
    throwPermanent(deps, "Offer has no Optizmo mailer access key")
  }

  const [syncRun] = await db
    .insert(suppressionSyncRun)
    .values({
      source: `optizmo:${offerId}`,
      trigger,
      status: "running",
      startedAt: now,
      createdAt: now,
    })
    .returning()

  if (!syncRun) {
    throwPermanent(deps, "Failed to create suppression_sync_run")
  }

  let encryptionKey: string
  try {
    encryptionKey =
      deps.encryptionKey ??
      (deps.env.APP_ENCRYPTION_KEY?.trim()
        ? deps.env.APP_ENCRYPTION_KEY
        : readAppEncryptionKeyFromEnv())
  } catch (error) {
    const message =
      error instanceof AppEncryptionError
        ? error.message
        : "APP_ENCRYPTION_KEY is not configured"
    await failOfferSync(db, {
      syncRunId: syncRun.id,
      offerId,
      message,
      now,
    })
    throwPermanent(deps, message)
  }

  let mailerAccessKey: string
  try {
    mailerAccessKey = decryptWithAppKey(
      row.optizmoMailerAccessKeyEncrypted,
      encryptionKey
    )
  } catch (error) {
    const message =
      error instanceof AppEncryptionError
        ? error.message
        : "Failed to decrypt Optizmo mailer access key"
    await failOfferSync(db, {
      syncRunId: syncRun.id,
      offerId,
      message,
      now,
    })
    throwPermanent(deps, message)
  }

  const optizmo = clientDeps(deps.env, deps.fetchImpl)
  if (!optizmo.apiKey) {
    const message = "OPTIZMO_API_KEY is not configured"
    await failOfferSync(db, {
      syncRunId: syncRun.id,
      offerId,
      message,
      now,
    })
    throwPermanent(deps, message)
  }

  try {
    await prepareOptizmoDownload(mailerAccessKey, optizmo)
    const stream = await streamOptizmoSuppressionFile(mailerAccessKey, optizmo)
    const emails = await parseOptizmoEmailStream(stream)

    if (emails.size === 0) {
      const message = "Optizmo suppression file was empty"
      await failOfferSync(db, {
        syncRunId: syncRun.id,
        offerId,
        message,
        now,
      })
      logger.warn(
        {
          event: "optizmo.sync",
          integration: OPTIZMO_INTEGRATION_NAME,
          operation: "sync_offer",
          status: "empty",
          duration_ms: Date.now() - started,
          offer_id: offerId,
        },
        "Optizmo sync empty file"
      )
      throwPermanent(deps, message)
    }

    const { rowsAdded, rowsRemoved } = await upsertOptizmoEmails(
      db,
      offerId,
      syncRun.id,
      emails
    )

    await db
      .update(suppressionSyncRun)
      .set({
        status: "completed",
        finishedAt: now,
        rowsAdded,
        rowsRemoved,
        error: null,
      })
      .where(eq(suppressionSyncRun.id, syncRun.id))

    await db
      .update(offer)
      .set({ lastSyncedAt: now, updatedAt: now })
      .where(eq(offer.id, offerId))

    await closeAlert(db, {
      type: OPTIZMO_SYNC_ALERT_TYPE,
      dedupeKey: optizmoSyncAlertDedupeKey(offerId),
      now,
    })
    await recordIntegrationResult(db, {
      name: OPTIZMO_INTEGRATION_NAME,
      ok: true,
      now,
    })

    logger.info(
      {
        event: "optizmo.sync",
        integration: OPTIZMO_INTEGRATION_NAME,
        operation: "sync_offer",
        status: "ok",
        duration_ms: Date.now() - started,
        offer_id: offerId,
        rows_added: rowsAdded,
        rows_removed: rowsRemoved,
        emails_seen: emails.size,
      },
      "Optizmo sync completed"
    )

    return {
      kind: "offer",
      offerId,
      rowsAdded,
      rowsRemoved,
      emailsSeen: emails.size,
    }
  } catch (error) {
    if (isPermanentFailure(error, deps)) {
      throw error
    }

    if (error instanceof OptizmoClientError) {
      await failOfferSync(db, {
        syncRunId: syncRun.id,
        offerId,
        message: error.message,
        now,
        firstDownload: error.code === "first_download_manual",
      })
      logger.warn(
        {
          event: "optizmo.sync",
          integration: OPTIZMO_INTEGRATION_NAME,
          operation: "sync_offer",
          status: "error",
          duration_ms: Date.now() - started,
          offer_id: offerId,
          error_code: error.code,
        },
        "Optizmo sync failed"
      )
      if (!error.retryable) {
        throwPermanent(deps, error.message)
      }
      throw error
    }

    const message =
      error instanceof Error ? error.message : "Optizmo sync failed"
    await failOfferSync(db, {
      syncRunId: syncRun.id,
      offerId,
      message,
      now,
    })
    throw error
  }
}

async function fanOutActiveOffers(
  deps: ProcessOptizmoSyncDeps
): Promise<Extract<OptizmoSyncResult, { kind: "fanout" }>> {
  if (!deps.syncQueue) {
    throwPermanent(deps, "Sync queue is required for optizmo-sync fan-out")
  }
  const rows = await deps.db
    .select({ id: offer.id })
    .from(offer)
    .where(
      and(eq(offer.status, "active"), eq(offer.hasOptizmoMailerAccessKey, true))
    )

  let enqueued = 0
  for (const row of rows) {
    await enqueueOptizmoSyncJob(deps.syncQueue, {
      offerId: row.id,
      trigger: "scheduled",
      now: deps.now,
    })
    enqueued += 1
  }
  return { kind: "fanout", enqueued }
}

export async function processOptizmoSyncJob(
  data: OptizmoSyncJobData,
  deps: ProcessOptizmoSyncDeps
): Promise<OptizmoSyncResult> {
  const offerIdRaw = data.offer_id?.trim()
  if (!offerIdRaw) {
    return fanOutActiveOffers(deps)
  }

  const offerId = uuidSchema.parse(offerIdRaw)
  const trigger = data.trigger === "scheduled" ? "scheduled" : "manual"
  return syncOneOffer(offerId, trigger, deps)
}
