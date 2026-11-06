import { and, desc, eq, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm"

import {
  offer,
  recipient,
  suppressionEntry,
  type SuppressionEntry,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import {
  AppError,
  hashEmail,
  isUniqueViolation,
  normaliseEmail,
  writeAudit,
} from "@workspace/shared"

import {
  serializeSuppression,
  type AddSuppressionJson,
  type SuppressionJson,
} from "./serialize"

type Db = Database | DatabaseTransaction

export type SuppressionActor = {
  userId: string
  requestId?: string | null
}

export type ListSuppressionsInput = {
  limit: number
  cursor?: string
  source?: SuppressionEntry["source"]
  scope?: SuppressionEntry["scope"]
  offerId?: string
  email?: string
  includeRemoved: boolean
}

export type AddManualSuppressionInput = {
  email: string
  offerId: string | null
}

type ActiveScope = "global" | "offer"

function auditSnapshot(row: SuppressionEntry): Record<string, string | null> {
  return {
    id: row.id,
    email_hash: row.emailHash,
    recipient_id: row.recipientId,
    scope: row.scope,
    offer_id: row.offerId,
    source: row.source,
    reason: row.reason,
    added_by: row.addedBy,
    created_at: row.createdAt.toISOString(),
    removed_at: row.removedAt ? row.removedAt.toISOString() : null,
  }
}

async function requireOffer(db: Db, offerId: string): Promise<void> {
  const [row] = await db
    .select({ id: offer.id })
    .from(offer)
    .where(eq(offer.id, offerId))
    .limit(1)
  if (!row) {
    throw AppError.validationFailed([
      { path: "offer_id", message: "Offer not found" },
    ])
  }
}

async function findRecipient(
  db: Db,
  email: string
): Promise<{ id: string; emailHash: string } | undefined> {
  const [row] = await db
    .select({ id: recipient.id, emailHash: recipient.emailHash })
    .from(recipient)
    .where(eq(recipient.email, email))
    .limit(1)
  return row
}

async function findActiveSuppression(
  db: Db,
  emailHash: string,
  scope: ActiveScope,
  offerId: string | null
): Promise<SuppressionEntry | undefined> {
  const offerMatch = offerId
    ? eq(suppressionEntry.offerId, offerId)
    : isNull(suppressionEntry.offerId)
  const [row] = await db
    .select()
    .from(suppressionEntry)
    .where(
      and(
        eq(suppressionEntry.emailHash, emailHash),
        eq(suppressionEntry.scope, scope),
        offerMatch,
        isNull(suppressionEntry.removedAt)
      )
    )
    .limit(1)
  return row
}

async function insertManual(
  db: Db,
  values: {
    emailHash: string
    recipientId: string | null
    scope: ActiveScope
    offerId: string | null
    addedBy: string
  }
): Promise<SuppressionEntry | undefined> {
  const row = {
    emailHash: values.emailHash,
    recipientId: values.recipientId,
    scope: values.scope,
    offerId: values.offerId,
    source: "manual" as const,
    addedBy: values.addedBy,
  }

  try {
    const inserted = values.offerId
      ? await db
          .insert(suppressionEntry)
          .values(row)
          .onConflictDoNothing({
            target: [
              suppressionEntry.emailHash,
              suppressionEntry.scope,
              suppressionEntry.offerId,
            ],
            where: sql`${suppressionEntry.removedAt} IS NULL AND ${suppressionEntry.offerId} IS NOT NULL`,
          })
          .returning()
      : await db
          .insert(suppressionEntry)
          .values(row)
          .onConflictDoNothing({
            target: [suppressionEntry.emailHash, suppressionEntry.scope],
            where: sql`${suppressionEntry.removedAt} IS NULL AND ${suppressionEntry.offerId} IS NULL`,
          })
          .returning()
    return inserted[0]
  } catch (error) {
    if (isUniqueViolation(error)) {
      return undefined
    }
    throw error
  }
}

function occupiedSuppression(existing: SuppressionEntry): never {
  getContextLogger().warn(
    {
      event: "suppression.conflict",
      suppression_id: existing.id,
      source: existing.source,
      scope: existing.scope,
      offer_id: existing.offerId,
      email_hash: existing.emailHash,
    },
    "Active suppression already exists for this email and scope"
  )
  throw AppError.conflict([
    {
      path: "email",
      message: "An active suppression already exists for this email and scope",
    },
    { path: "source", message: existing.source },
    { path: "id", message: existing.id },
  ])
}

async function loadSuppressionView(
  db: Db,
  id: string
): Promise<{ row: SuppressionEntry; email: string | null } | undefined> {
  const [found] = await db
    .select({
      entry: suppressionEntry,
      email: recipient.email,
    })
    .from(suppressionEntry)
    .leftJoin(recipient, eq(suppressionEntry.recipientId, recipient.id))
    .where(eq(suppressionEntry.id, id))
    .limit(1)
  if (!found) {
    return undefined
  }
  return { row: found.entry, email: found.email }
}

export async function listSuppressions(
  input: ListSuppressionsInput,
  db: Database = getDb()
): Promise<{ data: SuppressionJson[]; next_cursor: string | null }> {
  const conditions: SQL[] = []
  if (!input.includeRemoved) {
    conditions.push(isNull(suppressionEntry.removedAt))
  }
  if (input.source) {
    conditions.push(eq(suppressionEntry.source, input.source))
  }
  if (input.scope) {
    conditions.push(eq(suppressionEntry.scope, input.scope))
  }
  if (input.offerId) {
    conditions.push(eq(suppressionEntry.offerId, input.offerId))
  }
  if (input.email) {
    const emailMatch = or(
      eq(suppressionEntry.emailHash, hashEmail(input.email)),
      eq(recipient.email, input.email)
    )
    if (emailMatch) {
      conditions.push(emailMatch)
    }
  }
  if (input.cursor) {
    conditions.push(lt(suppressionEntry.id, input.cursor))
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = await db
    .select({
      entry: suppressionEntry,
      email: recipient.email,
    })
    .from(suppressionEntry)
    .leftJoin(recipient, eq(suppressionEntry.recipientId, recipient.id))
    .where(where)
    .orderBy(desc(suppressionEntry.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  const next = rows.length > input.limit ? (last?.entry.id ?? null) : null

  return {
    data: page.map((row) => serializeSuppression(row.entry, row.email)),
    next_cursor: next,
  }
}

export async function addManualSuppression(
  input: AddManualSuppressionInput,
  actor: SuppressionActor,
  db: Database = getDb()
): Promise<AddSuppressionJson> {
  const email = normaliseEmail(input.email)
  const offerId = input.offerId
  const scope: ActiveScope = offerId ? "offer" : "global"

  const outcome = await db.transaction(async (tx) => {
    if (offerId) {
      await requireOffer(tx, offerId)
    }

    const linked = await findRecipient(tx, email)
    const emailHash = linked?.emailHash ?? hashEmail(email)
    const recipientId = linked?.id ?? null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const inserted = await insertManual(tx, {
        emailHash,
        recipientId,
        scope,
        offerId,
        addedBy: actor.userId,
      })
      if (inserted) {
        await writeAudit(tx, {
          actor: { type: "user", id: actor.userId },
          action: "suppression_entry.create",
          objectType: "suppression_entry",
          objectId: inserted.id,
          requestId: actor.requestId,
          after: auditSnapshot(inserted),
        })
        return { row: inserted, created: true as const }
      }

      const existing = await findActiveSuppression(
        tx,
        emailHash,
        scope,
        offerId
      )
      if (!existing) {
        continue
      }
      if (existing.source === "manual") {
        return { row: existing, created: false as const }
      }
      occupiedSuppression(existing)
    }

    throw AppError.conflict([
      {
        path: "email",
        message: "Active suppression changed; retry the request",
      },
    ])
  })

  if (outcome.created) {
    getContextLogger().info(
      {
        event: "suppression.created",
        suppression_id: outcome.row.id,
        source: outcome.row.source,
        scope: outcome.row.scope,
        offer_id: outcome.row.offerId,
        email_hash: outcome.row.emailHash,
      },
      "Manual suppression created"
    )
  } else {
    getContextLogger().info(
      {
        event: "suppression.duplicate_ignored",
        suppression_id: outcome.row.id,
        source: outcome.row.source,
        scope: outcome.row.scope,
        offer_id: outcome.row.offerId,
        email_hash: outcome.row.emailHash,
      },
      "Duplicate manual suppression ignored"
    )
  }

  return {
    ...serializeSuppression(outcome.row, email),
    created: outcome.created,
  }
}

export async function removeSuppression(
  id: string,
  actor: SuppressionActor,
  db: Database = getDb()
): Promise<SuppressionJson> {
  const outcome = await db.transaction(async (tx) => {
    const now = new Date()
    const [updated] = await tx
      .update(suppressionEntry)
      .set({ removedAt: now })
      .where(
        and(
          eq(suppressionEntry.id, id),
          isNull(suppressionEntry.removedAt),
          ne(suppressionEntry.source, "hard_bounce")
        )
      )
      .returning()

    if (updated) {
      const view = await loadSuppressionView(tx, updated.id)
      const json = serializeSuppression(updated, view?.email ?? null)
      const before: SuppressionEntry = { ...updated, removedAt: null }
      await writeAudit(tx, {
        actor: { type: "user", id: actor.userId },
        action: "suppression_entry.remove",
        objectType: "suppression_entry",
        objectId: updated.id,
        requestId: actor.requestId,
        before: auditSnapshot(before),
        after: auditSnapshot(updated),
      })
      return { json, changed: true as const }
    }

    const current = await loadSuppressionView(tx, id)
    if (!current) {
      throw AppError.notFound([
        { path: "id", message: "Suppression not found" },
      ])
    }
    if (current.row.source === "hard_bounce") {
      getContextLogger().warn(
        {
          event: "suppression.remove_rejected",
          suppression_id: current.row.id,
          source: current.row.source,
          email_hash: current.row.emailHash,
        },
        "hard_bounce suppression cannot be removed"
      )
      throw AppError.conflict([
        {
          path: "source",
          message: "hard_bounce suppressions cannot be removed",
        },
      ])
    }
    if (current.row.removedAt) {
      return {
        json: serializeSuppression(current.row, current.email),
        changed: false as const,
      }
    }

    throw AppError.conflict([
      { path: "id", message: "Suppression could not be removed" },
    ])
  })

  if (outcome.changed) {
    getContextLogger().info(
      {
        event: "suppression.removed",
        suppression_id: outcome.json.id,
        source: outcome.json.source,
        scope: outcome.json.scope,
        offer_id: outcome.json.offer_id,
      },
      "Suppression removed"
    )
  }

  return outcome.json
}
