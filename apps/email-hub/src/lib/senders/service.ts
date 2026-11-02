import { and, desc, eq, lt } from "drizzle-orm"

import {
  domain,
  emailRoute,
  sender,
  type Domain,
  type Sender,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { AppError, emailSchema, writeAudit } from "@workspace/shared"

import {
  senderConflictDetails,
  serializeSender,
  type SenderJson,
} from "./serialize"

type Db = Database | DatabaseTransaction

export type SenderActor = {
  userId: string
  requestId?: string | null
}

export type ListSendersInput = {
  limit: number
  cursor?: string
  status?: Sender["status"]
  domainId?: string
}

export type CreateSenderInput = {
  domainId: string
  fromName: string
  localPart: string
  replyTo?: string | null
}

export type UpdateSenderInput = {
  version: number
  fromName?: string
  localPart?: string
  replyTo?: string | null
  status?: Sender["status"]
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }
  if ("code" in error && (error as { code: unknown }).code === "23505") {
    return true
  }
  if ("cause" in error) {
    return isUniqueViolation((error as { cause: unknown }).cause)
  }
  return false
}

async function requireSender(db: Db, id: string): Promise<Sender> {
  const [row] = await db.select().from(sender).where(eq(sender.id, id)).limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "id", message: "Sender not found" }])
  }
  return row
}

async function requireVerifiedDomain(
  db: Db,
  domainId: string
): Promise<Domain> {
  const [row] = await db
    .select()
    .from(domain)
    .where(eq(domain.id, domainId))
    .limit(1)
  if (!row) {
    throw AppError.validationFailed([
      { path: "domain_id", message: "Domain not found" },
    ])
  }
  if (row.status !== "verified") {
    throw AppError.validationFailed([
      {
        path: "domain_id",
        message: "Domain must be verified (active) to create a sender",
      },
    ])
  }
  return row
}

function composeFromEmail(localPart: string, domainName: string): string {
  const composed = `${localPart}@${domainName}`
  const parsed = emailSchema.safeParse(composed)
  if (!parsed.success) {
    throw AppError.validationFailed([
      { path: "local_part", message: "Invalid from address for this domain" },
    ])
  }
  return parsed.data
}

async function listActiveRoutesForSender(
  db: Db,
  senderId: string
): Promise<{ id: string }[]> {
  return db
    .select({ id: emailRoute.id })
    .from(emailRoute)
    .where(
      and(eq(emailRoute.senderId, senderId), eq(emailRoute.status, "active"))
    )
}

export async function listSenders(
  input: ListSendersInput,
  db: Database = getDb()
): Promise<{ data: SenderJson[]; next_cursor: string | null }> {
  const conditions = []
  if (input.status) {
    conditions.push(eq(sender.status, input.status))
  }
  if (input.domainId) {
    conditions.push(eq(sender.domainId, input.domainId))
  }
  if (input.cursor) {
    conditions.push(lt(sender.id, input.cursor))
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = await db
    .select()
    .from(sender)
    .where(where)
    .orderBy(desc(sender.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  const next = rows.length > input.limit ? (page.at(-1)?.id ?? null) : null

  return {
    data: page.map(serializeSender),
    next_cursor: next,
  }
}

export async function getSender(
  id: string,
  db: Database = getDb()
): Promise<SenderJson> {
  const row = await requireSender(db, id)
  return serializeSender(row)
}

export async function createSender(
  input: CreateSenderInput,
  actor: SenderActor,
  db: Database = getDb()
): Promise<SenderJson> {
  const domainRow = await requireVerifiedDomain(db, input.domainId)
  const fromEmail = composeFromEmail(input.localPart, domainRow.name)

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(sender)
        .values({
          domainId: input.domainId,
          fromName: input.fromName,
          fromEmail,
          replyTo: input.replyTo ?? null,
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
        action: "sender.create",
        objectType: "sender",
        objectId: row.id,
        requestId: actor.requestId,
        after: serializeSender(row),
      })

      return serializeSender(row)
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict([
        {
          path: "local_part",
          message: "A sender with this local part already exists on the domain",
        },
      ])
    }
    throw error
  }
}

export async function updateSender(
  id: string,
  input: UpdateSenderInput,
  actor: SenderActor,
  db: Database = getDb()
): Promise<SenderJson> {
  return db.transaction(async (tx) => {
    const before = await requireSender(tx, id)

    if (before.version !== input.version) {
      throw AppError.conflict(senderConflictDetails(before))
    }

    if (input.status === "inactive" && before.status !== "inactive") {
      const routes = await listActiveRoutesForSender(tx, id)
      if (routes.length > 0) {
        throw AppError.conflict(
          routes.map((route) => ({
            path: "email_route",
            message: route.id,
          }))
        )
      }
    }

    let fromEmail = before.fromEmail
    if (input.localPart !== undefined) {
      const [domainRow] = await tx
        .select()
        .from(domain)
        .where(eq(domain.id, before.domainId))
        .limit(1)
      if (!domainRow) {
        throw AppError.validationFailed([
          { path: "domain_id", message: "Domain not found" },
        ])
      }
      fromEmail = composeFromEmail(input.localPart, domainRow.name)
    }

    const now = new Date()
    const nextStatus = input.status ?? before.status
    let deactivatedAt = before.deactivatedAt
    if (nextStatus === "inactive" && before.status !== "inactive") {
      deactivatedAt = now
    } else if (nextStatus !== "inactive" && before.status === "inactive") {
      deactivatedAt = null
    }

    let row: Sender
    try {
      const [updated] = await tx
        .update(sender)
        .set({
          ...(input.fromName !== undefined ? { fromName: input.fromName } : {}),
          ...(input.localPart !== undefined ? { fromEmail } : {}),
          ...(input.replyTo !== undefined ? { replyTo: input.replyTo } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          deactivatedAt,
          version: before.version + 1,
          updatedAt: now,
        })
        .where(and(eq(sender.id, id), eq(sender.version, input.version)))
        .returning()

      if (!updated) {
        const current = await requireSender(tx, id)
        throw AppError.conflict(senderConflictDetails(current))
      }
      row = updated
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      if (isUniqueViolation(error)) {
        throw AppError.conflict([
          {
            path: "local_part",
            message:
              "A sender with this local part already exists on the domain",
          },
        ])
      }
      throw error
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "sender.update",
      objectType: "sender",
      objectId: row.id,
      requestId: actor.requestId,
      before: serializeSender(before),
      after: serializeSender(row),
    })

    return serializeSender(row)
  })
}
