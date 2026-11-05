import { and, desc, eq, lt, type SQL } from "drizzle-orm"

import {
  domain,
  emailCategory,
  message,
  offer,
  send,
  sender,
  template,
  templateVersion,
  type Send,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import { AppError, writeAudit } from "@workspace/shared"

import { sendConflictDetails, serializeSend, type SendJson } from "./serialize"
import {
  assertScheduleLeadTime,
  assertSendEditable,
  assertTransition,
  canTransition,
  type SendStatus,
} from "./state"

type Db = Database | DatabaseTransaction

export type SendActor = {
  userId: string
  requestId?: string | null
}

export type ListSendsInput = {
  limit: number
  cursor?: string
  status?: Send["status"]
  emailType?: Send["emailType"]
  offerId?: string
  senderId?: string
  categoryId?: string
  templateVersionId?: string
}

export type SendConfigInput = {
  templateVersionId: string
  senderId: string
  categoryId: string
  offerId?: string | null
  scheduledFor: Date
}

export type UpdateSendInput = {
  version: number
  templateVersionId?: string
  senderId?: string
  categoryId?: string
  offerId?: string | null
  scheduledFor?: Date
}

type SendConfig = {
  templateVersionId: string
  senderId: string
  categoryId: string
  offerId: string | null
  scheduledFor: Date
  emailType: Send["emailType"]
}

async function requireSend(db: Db, id: string): Promise<Send> {
  const [row] = await db.select().from(send).where(eq(send.id, id)).limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "id", message: "Send not found" }])
  }
  return row
}

function throwVersionConflict(row: Send, actor: SendActor): never {
  getContextLogger().warn(
    {
      event: "sends.version_conflict",
      request_id: actor.requestId ?? undefined,
      actor_id: actor.userId,
      send_id: row.id,
      previous_status: row.status,
      new_status: row.status,
      version: row.version,
    },
    "Send version conflict"
  )
  throw AppError.conflict(sendConflictDetails(row))
}

function rejectEdit(row: Send, actor: SendActor): never {
  getContextLogger().warn(
    {
      event: "sends.transition_rejected",
      request_id: actor.requestId ?? undefined,
      actor_id: actor.userId,
      send_id: row.id,
      previous_status: row.status,
      new_status: row.status,
    },
    "Send configuration is locked"
  )
  assertSendEditable(row.status)
  throw AppError.conflict([
    {
      path: "status",
      message: "Send configuration is locked",
    },
  ])
}

function rejectTransition(row: Send, to: SendStatus, actor: SendActor): never {
  getContextLogger().warn(
    {
      event: "sends.transition_rejected",
      request_id: actor.requestId ?? undefined,
      actor_id: actor.userId,
      send_id: row.id,
      previous_status: row.status,
      new_status: to,
    },
    "Send transition rejected"
  )
  assertTransition(row.status, to)
  throw AppError.conflict([
    {
      path: "status",
      message: `Cannot transition from ${row.status} to ${to}`,
    },
  ])
}

async function resolveTemplateVersion(
  db: Db,
  templateVersionId: string
): Promise<{
  emailType: Send["emailType"]
  categoryId: string
  status: "draft" | "active" | "archived"
  currentVersionId: string | null
}> {
  const [row] = await db
    .select({
      emailType: template.emailType,
      categoryId: template.categoryId,
      status: template.status,
      currentVersionId: template.currentVersionId,
    })
    .from(templateVersion)
    .innerJoin(template, eq(template.id, templateVersion.templateId))
    .where(eq(templateVersion.id, templateVersionId))
    .limit(1)

  if (!row) {
    throw AppError.validationFailed([
      { path: "template_version_id", message: "Template version not found" },
    ])
  }
  if (row.status === "archived") {
    throw AppError.validationFailed([
      {
        path: "template_version_id",
        message: "Template is archived",
      },
    ])
  }
  return row
}

async function requireActiveCategory(
  db: Db,
  categoryId: string,
  templateCategoryId: string
): Promise<void> {
  if (categoryId !== templateCategoryId) {
    throw AppError.validationFailed([
      {
        path: "category_id",
        message: "Category must match the template",
      },
    ])
  }
  const [row] = await db
    .select({ id: emailCategory.id, isActive: emailCategory.isActive })
    .from(emailCategory)
    .where(eq(emailCategory.id, categoryId))
    .limit(1)
  if (!row) {
    throw AppError.validationFailed([
      { path: "category_id", message: "Category not found" },
    ])
  }
  if (!row.isActive) {
    throw AppError.validationFailed([
      { path: "category_id", message: "Category must be active" },
    ])
  }
}

async function requireActiveSenderOnVerifiedDomain(
  db: Db,
  senderId: string
): Promise<void> {
  const [row] = await db
    .select()
    .from(sender)
    .where(eq(sender.id, senderId))
    .limit(1)
  if (!row) {
    throw AppError.validationFailed([
      { path: "sender_id", message: "Sender not found" },
    ])
  }
  if (row.status !== "active") {
    throw AppError.validationFailed([
      { path: "sender_id", message: "Sender must be active" },
    ])
  }

  const [domainRow] = await db
    .select({ status: domain.status })
    .from(domain)
    .where(eq(domain.id, row.domainId))
    .limit(1)
  if (!domainRow || domainRow.status !== "verified") {
    throw AppError.validationFailed([
      {
        path: "sender_id",
        message: "Sender must be on an active domain",
      },
    ])
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

async function assertSendConfiguration(
  db: Db,
  config: SendConfig,
  mode: "draft" | "schedule",
  now?: Date
): Promise<void> {
  const templateRow = await resolveTemplateVersion(db, config.templateVersionId)
  if (templateRow.emailType !== config.emailType) {
    throw AppError.validationFailed([
      {
        path: "template_version_id",
        message: "Template email type does not match the send",
      },
    ])
  }
  if (
    mode === "schedule" &&
    (templateRow.status !== "active" ||
      templateRow.currentVersionId !== config.templateVersionId)
  ) {
    throw AppError.validationFailed([
      {
        path: "template_version_id",
        message: "Template version must be the current published version",
      },
    ])
  }
  await requireActiveCategory(db, config.categoryId, templateRow.categoryId)
  await requireActiveSenderOnVerifiedDomain(db, config.senderId)
  if (config.offerId) {
    await requireOffer(db, config.offerId)
  }
  if (mode === "schedule") {
    assertScheduleLeadTime(config.scheduledFor, now ?? new Date())
  }
}

function configFromRow(row: Send): SendConfig {
  return {
    templateVersionId: row.templateVersionId,
    senderId: row.senderId,
    categoryId: row.categoryId,
    offerId: row.offerId,
    scheduledFor: row.scheduledFor,
    emailType: row.emailType,
  }
}

async function buildConfig(
  db: Db,
  input: SendConfigInput
): Promise<SendConfig> {
  const templateRow = await resolveTemplateVersion(db, input.templateVersionId)
  return {
    templateVersionId: input.templateVersionId,
    senderId: input.senderId,
    categoryId: input.categoryId,
    offerId: input.offerId ?? null,
    scheduledFor: input.scheduledFor,
    emailType: templateRow.emailType,
  }
}

function logSendEvent(
  event:
    | "sends.created"
    | "sends.updated"
    | "sends.scheduled"
    | "sends.cancelled"
    | "sends.deleted",
  row: SendJson,
  actor: SendActor,
  previousStatus?: SendStatus
): void {
  const message =
    event === "sends.created"
      ? "Send created"
      : event === "sends.updated"
        ? "Send updated"
        : event === "sends.scheduled"
          ? "Send scheduled"
          : event === "sends.cancelled"
            ? "Send cancelled"
            : "Send deleted"
  getContextLogger().info(
    {
      event,
      request_id: actor.requestId ?? undefined,
      actor_id: actor.userId,
      send_id: row.id,
      previous_status: previousStatus,
      new_status: row.status,
    },
    message
  )
}

export async function listSends(
  input: ListSendsInput,
  db: Database = getDb()
): Promise<{ data: SendJson[]; next_cursor: string | null }> {
  const conditions: SQL[] = []
  if (input.status) {
    conditions.push(eq(send.status, input.status))
  }
  if (input.emailType) {
    conditions.push(eq(send.emailType, input.emailType))
  }
  if (input.offerId) {
    conditions.push(eq(send.offerId, input.offerId))
  }
  if (input.senderId) {
    conditions.push(eq(send.senderId, input.senderId))
  }
  if (input.categoryId) {
    conditions.push(eq(send.categoryId, input.categoryId))
  }
  if (input.templateVersionId) {
    conditions.push(eq(send.templateVersionId, input.templateVersionId))
  }
  if (input.cursor) {
    conditions.push(lt(send.id, input.cursor))
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = await db
    .select()
    .from(send)
    .where(where)
    .orderBy(desc(send.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  const next = rows.length > input.limit ? (page.at(-1)?.id ?? null) : null

  return {
    data: page.map(serializeSend),
    next_cursor: next,
  }
}

export async function getSend(
  id: string,
  db: Database = getDb()
): Promise<SendJson> {
  const row = await requireSend(db, id)
  return serializeSend(row)
}

export async function createSend(
  input: SendConfigInput,
  actor: SendActor,
  db: Database = getDb()
): Promise<SendJson> {
  const created = await db.transaction(async (tx) => {
    const config = await buildConfig(tx, input)
    await assertSendConfiguration(tx, config, "draft")

    const [row] = await tx
      .insert(send)
      .values({
        emailType: config.emailType,
        templateVersionId: config.templateVersionId,
        senderId: config.senderId,
        categoryId: config.categoryId,
        offerId: config.offerId,
        scheduledFor: config.scheduledFor,
        status: "draft",
        version: 1,
        createdBy: actor.userId,
      })
      .returning()

    if (!row) {
      throw AppError.internal()
    }

    const json = serializeSend(row)
    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "send.create",
      objectType: "send",
      objectId: row.id,
      requestId: actor.requestId,
      after: json,
    })
    return json
  })

  logSendEvent("sends.created", created, actor)
  return created
}

export async function updateSend(
  id: string,
  input: UpdateSendInput,
  actor: SendActor,
  db: Database = getDb()
): Promise<SendJson> {
  const updated = await db.transaction(async (tx) => {
    const before = await requireSend(tx, id)
    if (before.version !== input.version) {
      throwVersionConflict(before, actor)
    }
    if (before.status !== "draft") {
      rejectEdit(before, actor)
    }

    const templateVersionId =
      input.templateVersionId ?? before.templateVersionId
    const templateRow = await resolveTemplateVersion(tx, templateVersionId)
    const next: SendConfig = {
      templateVersionId,
      senderId: input.senderId ?? before.senderId,
      categoryId: input.categoryId ?? before.categoryId,
      offerId: input.offerId !== undefined ? input.offerId : before.offerId,
      scheduledFor: input.scheduledFor ?? before.scheduledFor,
      emailType: templateRow.emailType,
    }
    await assertSendConfiguration(tx, next, "draft")

    const now = new Date()
    const [row] = await tx
      .update(send)
      .set({
        emailType: next.emailType,
        templateVersionId: next.templateVersionId,
        senderId: next.senderId,
        categoryId: next.categoryId,
        offerId: next.offerId,
        scheduledFor: next.scheduledFor,
        version: before.version + 1,
        updatedAt: now,
      })
      .where(and(eq(send.id, id), eq(send.version, input.version)))
      .returning()

    if (!row) {
      const current = await requireSend(tx, id)
      throwVersionConflict(current, actor)
    }

    const json = serializeSend(row)
    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "send.update",
      objectType: "send",
      objectId: row.id,
      requestId: actor.requestId,
      before: serializeSend(before),
      after: json,
    })
    return json
  })

  logSendEvent("sends.updated", updated, actor, "draft")
  return updated
}

export async function deleteSend(
  id: string,
  version: number,
  actor: SendActor,
  db: Database = getDb()
): Promise<SendJson> {
  const deleted = await db.transaction(async (tx) => {
    const before = await requireSend(tx, id)
    if (before.version !== version) {
      throwVersionConflict(before, actor)
    }
    if (before.status !== "draft") {
      throw AppError.conflict([
        {
          path: "status",
          message: "Only draft sends can be deleted",
        },
      ])
    }

    const [linked] = await tx
      .select({ id: message.id })
      .from(message)
      .where(eq(message.sendId, id))
      .limit(1)
    if (linked) {
      throw AppError.conflict([
        {
          path: "message",
          message: "Send has messages and cannot be deleted",
        },
      ])
    }

    const [row] = await tx
      .delete(send)
      .where(
        and(
          eq(send.id, id),
          eq(send.version, version),
          eq(send.status, "draft")
        )
      )
      .returning()

    if (!row) {
      const current = await requireSend(tx, id)
      if (current.version !== version) {
        throwVersionConflict(current, actor)
      }
      throw AppError.conflict([
        {
          path: "status",
          message: "Only draft sends can be deleted",
        },
      ])
    }

    const json = serializeSend(row)
    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "send.delete",
      objectType: "send",
      objectId: row.id,
      requestId: actor.requestId,
      before: json,
      after: null,
    })
    return json
  })

  logSendEvent("sends.deleted", deleted, actor, "draft")
  return deleted
}

async function transitionSend(
  id: string,
  version: number,
  to: "scheduled" | "cancelled",
  actor: SendActor,
  db: Database
): Promise<SendJson> {
  return db.transaction(async (tx) => {
    const before = await requireSend(tx, id)
    if (before.version !== version) {
      throwVersionConflict(before, actor)
    }
    if (!canTransition(before.status, to)) {
      rejectTransition(before, to, actor)
    }

    if (to === "scheduled") {
      await assertSendConfiguration(tx, configFromRow(before), "schedule")
    }

    const now = new Date()
    const [row] = await tx
      .update(send)
      .set({
        status: to,
        version: before.version + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(send.id, id),
          eq(send.version, version),
          eq(send.status, before.status)
        )
      )
      .returning()

    if (!row) {
      const current = await requireSend(tx, id)
      if (current.version !== version) {
        throwVersionConflict(current, actor)
      }
      rejectTransition(current, to, actor)
    }

    const json = serializeSend(row)
    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: to === "scheduled" ? "send.schedule" : "send.cancel",
      objectType: "send",
      objectId: row.id,
      requestId: actor.requestId,
      before: serializeSend(before),
      after: json,
    })
    return json
  })
}

export async function scheduleSend(
  id: string,
  version: number,
  actor: SendActor,
  db: Database = getDb()
): Promise<SendJson> {
  const scheduled = await transitionSend(id, version, "scheduled", actor, db)
  logSendEvent("sends.scheduled", scheduled, actor, "draft")
  return scheduled
}

export async function cancelSend(
  id: string,
  version: number,
  actor: SendActor,
  db: Database = getDb()
): Promise<SendJson> {
  const cancelled = await transitionSend(id, version, "cancelled", actor, db)
  logSendEvent("sends.cancelled", cancelled, actor, "scheduled")
  return cancelled
}
