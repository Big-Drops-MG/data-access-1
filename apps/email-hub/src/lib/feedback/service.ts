import { and, desc, eq, lt, sql, type SQL } from "drizzle-orm"

import {
  feedbackClassification,
  feedbackItem,
  recipient,
  suppressionEntry,
  type FeedbackItem,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import { AppError, isUniqueViolation, writeAudit } from "@workspace/shared"

import { serializeFeedback, type FeedbackJson } from "./serialize"

type Db = Database | DatabaseTransaction

export type FeedbackActor = {
  userId: string
  requestId?: string | null
}

export type ListFeedbackInput = {
  limit: number
  cursor?: string
  status?: FeedbackItem["status"]
}

export type DecideFeedbackInput = {
  classificationId: string
  decision: NonNullable<FeedbackItem["decision"]>
}

/** Claim lock TTL — second reviewer gets 409 until this elapses (SD#9.8). */
export const CLAIM_LOCK_MS = 30 * 60 * 1000

type FeedbackRow = {
  item: FeedbackItem
  email: string | null
  classificationKey: string | null
  classificationLabel: string | null
}

function auditSnapshot(row: FeedbackItem): Record<string, string | null> {
  return {
    id: row.id,
    recipient_id: row.recipientId,
    message_id: row.messageId,
    source: row.source,
    status: row.status,
    reviewing_by: row.reviewingBy,
    locked_at: row.lockedAt ? row.lockedAt.toISOString() : null,
    classification_id: row.classificationId,
    decision: row.decision,
    decided_by: row.decidedBy,
    decided_at: row.decidedAt ? row.decidedAt.toISOString() : null,
  }
}

function toJson(row: FeedbackRow): FeedbackJson {
  return serializeFeedback(row.item, {
    email: row.email,
    classificationKey: row.classificationKey,
    classificationLabel: row.classificationLabel,
  })
}

function claimHeldByOther(
  row: FeedbackItem,
  userId: string,
  now: Date
): boolean {
  if (!row.reviewingBy || row.reviewingBy === userId) {
    return false
  }
  if (!row.lockedAt) {
    return false
  }
  return now.getTime() - row.lockedAt.getTime() < CLAIM_LOCK_MS
}

async function loadFeedbackRow(
  db: Db,
  id: string
): Promise<FeedbackRow | undefined> {
  const [row] = await db
    .select({
      item: feedbackItem,
      email: recipient.email,
      classificationKey: feedbackClassification.key,
      classificationLabel: feedbackClassification.label,
    })
    .from(feedbackItem)
    .leftJoin(recipient, eq(recipient.id, feedbackItem.recipientId))
    .leftJoin(
      feedbackClassification,
      eq(feedbackClassification.id, feedbackItem.classificationId)
    )
    .where(eq(feedbackItem.id, id))
    .limit(1)
  if (!row) {
    return undefined
  }
  return {
    item: row.item,
    email: row.email ?? null,
    classificationKey: row.classificationKey ?? null,
    classificationLabel: row.classificationLabel ?? null,
  }
}

function throwNotFound(): never {
  throw AppError.notFound()
}

function throwClaimConflict(row: FeedbackItem): never {
  getContextLogger().warn(
    {
      event: "feedback.claim_conflict",
      feedback_item_id: row.id,
      reviewing_by: row.reviewingBy,
      locked_at: row.lockedAt?.toISOString() ?? null,
    },
    "Feedback claim held by another reviewer"
  )
  throw AppError.conflict([
    {
      path: "id",
      message: "Feedback item is claimed by another reviewer",
    },
  ])
}

export async function listFeedback(
  input: ListFeedbackInput,
  db: Database = getDb()
): Promise<{ data: FeedbackJson[]; next_cursor: string | null }> {
  const conditions: SQL[] = []
  if (input.status) {
    conditions.push(eq(feedbackItem.status, input.status))
  }
  if (input.cursor) {
    conditions.push(lt(feedbackItem.id, input.cursor))
  }
  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = await db
    .select({
      item: feedbackItem,
      email: recipient.email,
      classificationKey: feedbackClassification.key,
      classificationLabel: feedbackClassification.label,
    })
    .from(feedbackItem)
    .leftJoin(recipient, eq(recipient.id, feedbackItem.recipientId))
    .leftJoin(
      feedbackClassification,
      eq(feedbackClassification.id, feedbackItem.classificationId)
    )
    .where(where)
    .orderBy(desc(feedbackItem.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  const next = rows.length > input.limit ? (last?.item.id ?? null) : null

  return {
    data: page.map((row) =>
      toJson({
        item: row.item,
        email: row.email ?? null,
        classificationKey: row.classificationKey ?? null,
        classificationLabel: row.classificationLabel ?? null,
      })
    ),
    next_cursor: next,
  }
}

export async function getFeedback(
  id: string,
  db: Database = getDb()
): Promise<FeedbackJson> {
  const row = await loadFeedbackRow(db, id)
  if (!row) {
    throwNotFound()
  }
  return toJson(row)
}

export async function claimFeedback(
  id: string,
  actor: FeedbackActor,
  db: Database = getDb()
): Promise<FeedbackJson> {
  return db.transaction(async (tx) => {
    const existing = await loadFeedbackRow(tx, id)
    if (!existing) {
      throwNotFound()
    }
    const before = existing.item
    if (before.status === "resolved") {
      throw AppError.conflict([
        { path: "id", message: "Feedback item is already resolved" },
      ])
    }

    const now = new Date()
    if (claimHeldByOther(before, actor.userId, now)) {
      throwClaimConflict(before)
    }

    const [updated] = await tx
      .update(feedbackItem)
      .set({
        status: "in_review",
        reviewingBy: actor.userId,
        lockedAt: now,
        updatedAt: now,
      })
      .where(eq(feedbackItem.id, id))
      .returning()

    if (!updated) {
      throw AppError.internal()
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "feedback_item.claim",
      objectType: "feedback_item",
      objectId: updated.id,
      requestId: actor.requestId,
      before: auditSnapshot(before),
      after: auditSnapshot(updated),
    })

    getContextLogger().info(
      {
        event: "feedback.claimed",
        feedback_item_id: updated.id,
        user_id: actor.userId,
      },
      "Feedback item claimed"
    )

    return toJson({
      item: updated,
      email: existing.email,
      classificationKey: existing.classificationKey,
      classificationLabel: existing.classificationLabel,
    })
  })
}

async function requireActiveClassification(
  db: Db,
  classificationId: string
): Promise<{ id: string; key: string; label: string }> {
  const [row] = await db
    .select({
      id: feedbackClassification.id,
      key: feedbackClassification.key,
      label: feedbackClassification.label,
      active: feedbackClassification.active,
    })
    .from(feedbackClassification)
    .where(eq(feedbackClassification.id, classificationId))
    .limit(1)
  if (!row || !row.active) {
    throw AppError.validationFailed([
      {
        path: "classification_id",
        message: "Classification not found or inactive",
      },
    ])
  }
  return { id: row.id, key: row.key, label: row.label }
}

async function insertFeedbackSuppression(
  db: Db,
  values: {
    emailHash: string
    recipientId: string
    addedBy: string
    reason: string
  }
): Promise<void> {
  try {
    await db
      .insert(suppressionEntry)
      .values({
        emailHash: values.emailHash,
        recipientId: values.recipientId,
        scope: "global",
        source: "feedback_review",
        reason: values.reason,
        addedBy: values.addedBy,
      })
      .onConflictDoNothing({
        target: [suppressionEntry.emailHash, suppressionEntry.scope],
        where: sql`${suppressionEntry.removedAt} IS NULL AND ${suppressionEntry.offerId} IS NULL`,
      })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return
    }
    throw error
  }
}

export async function decideFeedback(
  id: string,
  input: DecideFeedbackInput,
  actor: FeedbackActor,
  db: Database = getDb()
): Promise<FeedbackJson> {
  return db.transaction(async (tx) => {
    const existing = await loadFeedbackRow(tx, id)
    if (!existing) {
      throwNotFound()
    }
    const before = existing.item
    if (before.status === "resolved") {
      throw AppError.conflict([
        { path: "id", message: "Feedback item is already resolved" },
      ])
    }

    const now = new Date()
    if (before.reviewingBy !== actor.userId) {
      if (claimHeldByOther(before, actor.userId, now)) {
        throwClaimConflict(before)
      }
      throw AppError.conflict([
        {
          path: "id",
          message: "Claim the feedback item before deciding",
        },
      ])
    }

    if (
      input.decision === "suppress" &&
      (!before.recipientId || !before.messageId)
    ) {
      throw AppError.validationFailed([
        {
          path: "decision",
          message:
            "Suppress requires a linked recipient and message; use no_action or escalate",
        },
      ])
    }

    const classification = await requireActiveClassification(
      tx,
      input.classificationId
    )

    const [updated] = await tx
      .update(feedbackItem)
      .set({
        classificationId: classification.id,
        decision: input.decision,
        decidedBy: actor.userId,
        decidedAt: now,
        status: "resolved",
        reviewingBy: null,
        lockedAt: null,
        updatedAt: now,
      })
      .where(eq(feedbackItem.id, id))
      .returning()

    if (!updated) {
      throw AppError.internal()
    }

    if (input.decision === "suppress" && before.recipientId) {
      const [recip] = await tx
        .select({
          id: recipient.id,
          emailHash: recipient.emailHash,
        })
        .from(recipient)
        .where(eq(recipient.id, before.recipientId))
        .limit(1)
      if (!recip) {
        throw AppError.validationFailed([
          {
            path: "decision",
            message:
              "Suppress requires a linked recipient; use no_action or escalate",
          },
        ])
      }
      await insertFeedbackSuppression(tx, {
        emailHash: recip.emailHash,
        recipientId: recip.id,
        addedBy: actor.userId,
        reason: `feedback_review:${classification.key}`,
      })
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "feedback_item.decide",
      objectType: "feedback_item",
      objectId: updated.id,
      requestId: actor.requestId,
      before: auditSnapshot(before),
      after: {
        ...auditSnapshot(updated),
        suppression_source:
          input.decision === "suppress" ? "feedback_review" : null,
      },
    })

    getContextLogger().info(
      {
        event: "feedback.decided",
        feedback_item_id: updated.id,
        decision: input.decision,
        user_id: actor.userId,
      },
      "Feedback item decided"
    )

    return toJson({
      item: updated,
      email: existing.email,
      classificationKey: classification.key,
      classificationLabel: classification.label,
    })
  })
}

/** Exported for unit tests — detect stale vs held claims. */
export function isClaimHeldByOther(
  row: Pick<FeedbackItem, "reviewingBy" | "lockedAt">,
  userId: string,
  now: Date = new Date()
): boolean {
  return claimHeldByOther(row as FeedbackItem, userId, now)
}
