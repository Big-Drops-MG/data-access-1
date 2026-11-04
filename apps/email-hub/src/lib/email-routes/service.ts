import { and, desc, eq, isNull, lt, type SQL } from "drizzle-orm"

import {
  domain,
  emailRoute,
  offer,
  sender,
  template,
  type EmailRoute,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import { AppError, isUniqueViolation, writeAudit } from "@workspace/shared"

import {
  emailRouteConflictDetails,
  serializeEmailRoute,
  type EmailRouteJson,
} from "./serialize"

type Db = Database | DatabaseTransaction

export type EmailRouteActor = {
  userId: string
  requestId?: string | null
}

export type ListEmailRoutesInput = {
  limit: number
  cursor?: string
  status?: EmailRoute["status"]
  emailType?: EmailRoute["emailType"]
  offerId?: string
  templateId?: string
  senderId?: string
}

export type CreateEmailRouteInput = {
  emailType: EmailRoute["emailType"]
  offerId?: string | null
  templateId: string
  senderId: string
}

export type UpdateEmailRouteInput = {
  version: number
  emailType?: EmailRoute["emailType"]
  offerId?: string | null
  templateId?: string
  senderId?: string
  status?: EmailRoute["status"]
}

type RouteReferences = {
  emailType: EmailRoute["emailType"]
  offerId: string | null
  templateId: string
  senderId: string
}

async function requireEmailRoute(db: Db, id: string): Promise<EmailRoute> {
  const [row] = await db
    .select()
    .from(emailRoute)
    .where(eq(emailRoute.id, id))
    .limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "id", message: "Email route not found" }])
  }
  return row
}

async function requirePublishedTemplate(
  db: Db,
  templateId: string,
  emailType: EmailRoute["emailType"]
): Promise<void> {
  const [row] = await db
    .select()
    .from(template)
    .where(eq(template.id, templateId))
    .limit(1)
  if (!row) {
    throw AppError.validationFailed([
      { path: "template_id", message: "Template not found" },
    ])
  }
  if (row.status !== "active" || row.currentVersionId === null) {
    throw AppError.validationFailed([
      { path: "template_id", message: "Template must be published" },
    ])
  }
  if (row.emailType !== emailType) {
    throw AppError.validationFailed([
      {
        path: "template_id",
        message: "Template email type must match the route",
      },
    ])
  }
}

async function requireActiveSenderOnActiveDomain(
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
    .select()
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

async function assertRouteReferences(
  db: Db,
  refs: RouteReferences
): Promise<void> {
  await requirePublishedTemplate(db, refs.templateId, refs.emailType)
  await requireActiveSenderOnActiveDomain(db, refs.senderId)
  if (refs.offerId) {
    await requireOffer(db, refs.offerId)
  }
}

async function findActiveRoute(
  db: Db,
  emailType: EmailRoute["emailType"],
  offerId: string | null
): Promise<{ id: string } | undefined> {
  const offerMatch = offerId
    ? eq(emailRoute.offerId, offerId)
    : isNull(emailRoute.offerId)
  const [row] = await db
    .select({ id: emailRoute.id })
    .from(emailRoute)
    .where(
      and(
        eq(emailRoute.emailType, emailType),
        eq(emailRoute.status, "active"),
        offerMatch
      )
    )
    .limit(1)
  return row
}

async function activeRouteConflict(
  db: Db,
  emailType: EmailRoute["emailType"],
  offerId: string | null
): Promise<never> {
  const existing = await findActiveRoute(db, emailType, offerId)
  const details = [
    {
      path: "email_type",
      message: "An active route already exists for this email type and offer",
    },
    { path: "offer_id", message: offerId ?? "" },
  ]
  if (existing) {
    details.push({ path: "email_route", message: existing.id })
  }
  getContextLogger().warn(
    {
      event: "email_route.conflict",
      route_id: existing?.id ?? null,
      email_type: emailType,
      offer_id: offerId,
    },
    "Active email route already exists for this email type and offer"
  )
  throw AppError.conflict(details)
}

function logRouteEvent(
  event: "email_route.created" | "email_route.updated" | "email_route.archived",
  route: EmailRouteJson
): void {
  const message =
    event === "email_route.created"
      ? "Email route created"
      : event === "email_route.archived"
        ? "Email route archived"
        : "Email route updated"
  getContextLogger().info(
    {
      event,
      route_id: route.id,
      email_type: route.email_type,
      offer_id: route.offer_id,
    },
    message
  )
}

function referencesChanged(before: EmailRoute, next: RouteReferences): boolean {
  return (
    before.templateId !== next.templateId ||
    before.senderId !== next.senderId ||
    before.emailType !== next.emailType ||
    before.offerId !== next.offerId
  )
}

export async function listEmailRoutes(
  input: ListEmailRoutesInput,
  db: Database = getDb()
): Promise<{ data: EmailRouteJson[]; next_cursor: string | null }> {
  const conditions: SQL[] = []
  if (input.status) {
    conditions.push(eq(emailRoute.status, input.status))
  }
  if (input.emailType) {
    conditions.push(eq(emailRoute.emailType, input.emailType))
  }
  if (input.offerId) {
    conditions.push(eq(emailRoute.offerId, input.offerId))
  }
  if (input.templateId) {
    conditions.push(eq(emailRoute.templateId, input.templateId))
  }
  if (input.senderId) {
    conditions.push(eq(emailRoute.senderId, input.senderId))
  }
  if (input.cursor) {
    conditions.push(lt(emailRoute.id, input.cursor))
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = await db
    .select()
    .from(emailRoute)
    .where(where)
    .orderBy(desc(emailRoute.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  const next = rows.length > input.limit ? (page.at(-1)?.id ?? null) : null

  return {
    data: page.map(serializeEmailRoute),
    next_cursor: next,
  }
}

export async function getEmailRoute(
  id: string,
  db: Database = getDb()
): Promise<EmailRouteJson> {
  const row = await requireEmailRoute(db, id)
  return serializeEmailRoute(row)
}

export async function createEmailRoute(
  input: CreateEmailRouteInput,
  actor: EmailRouteActor,
  db: Database = getDb()
): Promise<EmailRouteJson> {
  const offerId = input.offerId ?? null
  let created: EmailRouteJson
  try {
    created = await db.transaction(async (tx) => {
      await assertRouteReferences(tx, {
        emailType: input.emailType,
        offerId,
        templateId: input.templateId,
        senderId: input.senderId,
      })

      const [row] = await tx
        .insert(emailRoute)
        .values({
          emailType: input.emailType,
          offerId,
          templateId: input.templateId,
          senderId: input.senderId,
          status: "active",
          version: 1,
          createdBy: actor.userId,
        })
        .returning()

      if (!row) {
        throw AppError.internal()
      }

      await writeAudit(tx, {
        actor: { type: "user", id: actor.userId },
        action: "email_route.create",
        objectType: "email_route",
        objectId: row.id,
        requestId: actor.requestId,
        after: serializeEmailRoute(row),
      })

      return serializeEmailRoute(row)
    })
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    if (isUniqueViolation(error)) {
      throw await activeRouteConflict(db, input.emailType, offerId)
    }
    throw error
  }

  logRouteEvent("email_route.created", created)
  return created
}

export async function updateEmailRoute(
  id: string,
  input: UpdateEmailRouteInput,
  actor: EmailRouteActor,
  db: Database = getDb()
): Promise<EmailRouteJson> {
  const conflictKey: {
    emailType: EmailRoute["emailType"] | null
    offerId: string | null
  } = { emailType: null, offerId: null }
  let updated: EmailRouteJson
  let event: "email_route.updated" | "email_route.archived"

  try {
    const result = await db.transaction(async (tx) => {
      const before = await requireEmailRoute(tx, id)
      if (before.version !== input.version) {
        throw AppError.conflict(emailRouteConflictDetails(before))
      }

      const next: RouteReferences & { status: EmailRoute["status"] } = {
        emailType: input.emailType ?? before.emailType,
        offerId: input.offerId !== undefined ? input.offerId : before.offerId,
        templateId: input.templateId ?? before.templateId,
        senderId: input.senderId ?? before.senderId,
        status: input.status ?? before.status,
      }
      conflictKey.emailType = next.emailType
      conflictKey.offerId = next.offerId

      if (before.status === "inactive" && next.status === "active") {
        throw AppError.conflict([
          {
            path: "status",
            message: "Archived email routes cannot be reactivated",
          },
        ])
      }

      if (next.status === "active" || referencesChanged(before, next)) {
        await assertRouteReferences(tx, next)
      }

      const now = new Date()
      const [row] = await tx
        .update(emailRoute)
        .set({
          emailType: next.emailType,
          offerId: next.offerId,
          templateId: next.templateId,
          senderId: next.senderId,
          status: next.status,
          version: before.version + 1,
          updatedAt: now,
        })
        .where(
          and(eq(emailRoute.id, id), eq(emailRoute.version, input.version))
        )
        .returning()

      if (!row) {
        const current = await requireEmailRoute(tx, id)
        throw AppError.conflict(emailRouteConflictDetails(current))
      }

      const archiving = before.status === "active" && next.status === "inactive"

      await writeAudit(tx, {
        actor: { type: "user", id: actor.userId },
        action: archiving ? "email_route.archive" : "email_route.update",
        objectType: "email_route",
        objectId: row.id,
        requestId: actor.requestId,
        before: serializeEmailRoute(before),
        after: serializeEmailRoute(row),
      })

      return {
        route: serializeEmailRoute(row),
        archived: archiving,
      }
    })
    updated = result.route
    event = result.archived ? "email_route.archived" : "email_route.updated"
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }
    if (isUniqueViolation(error) && conflictKey.emailType !== null) {
      throw await activeRouteConflict(
        db,
        conflictKey.emailType,
        conflictKey.offerId
      )
    }
    throw error
  }

  logRouteEvent(event, updated)
  return updated
}

export async function archiveEmailRoute(
  id: string,
  actor: EmailRouteActor,
  db: Database = getDb()
): Promise<EmailRouteJson> {
  const outcome = await db.transaction(async (tx) => {
    const before = await requireEmailRoute(tx, id)
    if (before.status === "inactive") {
      return { route: serializeEmailRoute(before), changed: false }
    }

    const now = new Date()
    const [row] = await tx
      .update(emailRoute)
      .set({
        status: "inactive",
        version: before.version + 1,
        updatedAt: now,
      })
      .where(and(eq(emailRoute.id, id), eq(emailRoute.status, "active")))
      .returning()

    if (!row) {
      const current = await requireEmailRoute(tx, id)
      if (current.status === "inactive") {
        return { route: serializeEmailRoute(current), changed: false }
      }
      throw AppError.conflict(emailRouteConflictDetails(current))
    }

    const route = serializeEmailRoute(row)
    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "email_route.archive",
      objectType: "email_route",
      objectId: row.id,
      requestId: actor.requestId,
      before: serializeEmailRoute(before),
      after: route,
    })

    return { route, changed: true }
  })

  if (outcome.changed) {
    logRouteEvent("email_route.archived", outcome.route)
  }
  return outcome.route
}
