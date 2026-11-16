import { asc, eq } from "drizzle-orm"

import {
  offer,
  type OfferCreativeJson,
  type OfferTrackingLinksJson,
} from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import {
  AppError,
  isUniqueViolation,
  recordIntegrationResult,
  writeAudit,
} from "@workspace/shared"
import { getContextLogger } from "@workspace/logger"

import {
  encryptWithAppKey,
  readAppEncryptionKeyFromEnv,
} from "@/lib/crypto/app-encryption"
import {
  fetchEverflowOfferById,
  type EverflowOfferDetail,
} from "@/lib/everflow/client"

import {
  serializeOffer,
  serializeOfferListItem,
  type OfferJson,
  type OfferListItemJson,
} from "./serialize"

export type ListOffersInput = {
  limit: number
  status: "active" | "inactive"
}

export type OfferActor = {
  userId: string
  requestId?: string | null
}

type ImportDeps = {
  db?: Database
  fetchOffer?: (offerId: number) => Promise<EverflowOfferDetail>
  encryptionKey?: string
  now?: Date
}

function mapOfferStatus(status: string): "active" | "inactive" {
  return status.trim().toLowerCase() === "active" ? "active" : "inactive"
}

function buildTrackingLinks(
  detail: EverflowOfferDetail
): OfferTrackingLinksJson {
  return {
    tracking_url: detail.tracking_url,
    impression_tracking_url: detail.impression_tracking_url,
    redirect_tracking_url: detail.redirect_tracking_url,
    urls: detail.urls,
  }
}

function buildCreatives(detail: EverflowOfferDetail): OfferCreativeJson[] {
  return detail.creatives.map((row) => ({
    network_offer_creative_id: row.network_offer_creative_id,
    name: row.name,
    creative_type: row.creative_type,
    creative_status: row.creative_status,
    resource_url: row.resource_url,
  }))
}

export async function listOffers(
  input: ListOffersInput,
  db: Database = getDb()
): Promise<{ data: OfferListItemJson[] }> {
  const rows = await db
    .select()
    .from(offer)
    .where(eq(offer.status, input.status))
    .orderBy(asc(offer.name), asc(offer.id))
    .limit(input.limit)

  return { data: rows.map(serializeOfferListItem) }
}

export async function getOfferByEverflowId(
  everflowOfferId: number,
  db: Database = getDb()
): Promise<OfferJson> {
  const [row] = await db
    .select()
    .from(offer)
    .where(eq(offer.everflowOfferId, everflowOfferId))
    .limit(1)

  if (!row) {
    throw AppError.notFound([
      { path: "everflow_offer_id", message: "Offer not found" },
    ])
  }

  return serializeOffer(row)
}

export async function importOfferFromEverflow(
  everflowOfferId: number,
  actor: OfferActor,
  deps: ImportDeps = {}
): Promise<OfferJson> {
  const db = deps.db ?? getDb()
  const now = deps.now ?? new Date()
  const fetchOffer = deps.fetchOffer ?? fetchEverflowOfferById
  const logger = getContextLogger()
  const started = Date.now()

  let detail: EverflowOfferDetail
  try {
    detail = await fetchOffer(everflowOfferId)
    await recordIntegrationResult(db, {
      name: "everflow",
      ok: true,
      now,
    })
    logger.info(
      {
        event: "everflow.offer_fetch",
        integration: "everflow",
        operation: "fetch_offer",
        status: "ok",
        duration_ms: Date.now() - started,
        everflow_offer_id: everflowOfferId,
      },
      "Everflow offer fetched"
    )
  } catch (error) {
    const message =
      error instanceof AppError
        ? (error.details[0]?.message ?? error.message)
        : "Everflow request failed"
    await recordIntegrationResult(db, {
      name: "everflow",
      ok: false,
      error: message,
      now,
    })
    logger.warn(
      {
        event: "everflow.offer_fetch",
        integration: "everflow",
        operation: "fetch_offer",
        status: "error",
        duration_ms: Date.now() - started,
        everflow_offer_id: everflowOfferId,
      },
      "Everflow offer fetch failed"
    )
    throw error
  }

  let mailerEncrypted: string | null = null
  let hasMailerKey = false
  if (detail.optizmo_mailer_access_key) {
    const encryptionKey = deps.encryptionKey ?? readAppEncryptionKeyFromEnv()
    try {
      mailerEncrypted = encryptWithAppKey(
        detail.optizmo_mailer_access_key,
        encryptionKey
      )
      hasMailerKey = true
    } catch {
      throw AppError.unavailable([
        {
          path: "app_encryption_key",
          message: "APP_ENCRYPTION_KEY is not configured",
        },
      ])
    }
  }

  const values = {
    name: detail.name,
    externalRef: String(detail.network_offer_id),
    everflowOfferId: detail.network_offer_id,
    status: mapOfferStatus(detail.offer_status),
    approvedSubjectLines: detail.subject_lines,
    approvedFromLines: detail.from_lines,
    trackingLinks: buildTrackingLinks(detail),
    creatives: buildCreatives(detail),
    unsubscribeUrl: detail.unsubscribe_url,
    suppressionFileUrl: detail.suppression_file_url,
    optizmoMailerAccessKeyEncrypted: mailerEncrypted,
    hasOptizmoMailerAccessKey: hasMailerKey,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(offer).values(values).returning()
      if (!row) {
        throw AppError.internal()
      }

      await writeAudit(tx, {
        actor: { type: "user", id: actor.userId },
        action: "offer.imported",
        objectType: "offer",
        objectId: row.id,
        requestId: actor.requestId ?? null,
        before: null,
        after: {
          everflow_offer_id: row.everflowOfferId,
          name: row.name,
          status: row.status,
          has_optizmo_mailer_access_key: row.hasOptizmoMailerAccessKey,
          unsubscribe_url: row.unsubscribeUrl,
          suppression_file_url: row.suppressionFileUrl,
        },
      })

      return row
    })

    return serializeOffer(created)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict([
        {
          path: "everflow_offer_id",
          message: "Offer already imported",
        },
      ])
    }
    throw error
  }
}
