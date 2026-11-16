import { session, user, verification, type User } from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { AppError, normaliseEmail, writeAudit } from "@workspace/shared"
import { and, asc, eq, sql } from "drizzle-orm"
import { v7 as uuidv7 } from "uuid"

import { isAllowedSsoEmailDomain } from "@/lib/auth/admin-emails"
import { deleteTrustedDevicesForUser } from "@/lib/auth/trusted-device"
import { resetTwoFactorForAdmin } from "@/lib/auth/two-factor-lockout"

import { consumeInvitation } from "./invitation-store"
import {
  createInvitationSecret,
  encodeInvitationValue,
  invitationExpiresAt,
  invitationIdentifier,
  parseInvitationValue,
} from "./invitation"
import { isActiveAdmin, isSameUser, removalLeavesNoActiveAdmin } from "./rules"
import {
  serializeInvitation,
  serializeUser,
  type DisabledUserJson,
  type InvitationJson,
  type UserJson,
} from "./serialize"

export const ACTIVE_ADMIN_LOCK_KEY = "emailhub:active-admins"

export type UserActor = {
  userId: string
  requestId?: string | null
}

type Tx = DatabaseTransaction

function assertStaffRole(role: string): asserts role is User["role"] {
  if (role !== "admin" && role !== "operator" && role !== "viewer") {
    throw AppError.validationFailed([{ path: "role", message: "Invalid role" }])
  }
}

async function lockActiveAdmins(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${ACTIVE_ADMIN_LOCK_KEY}::text))`
  )
}

async function lockInvitation(tx: Tx, identifier: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${identifier}::text))`
  )
}

async function loadUserForUpdate(
  tx: Tx,
  userId: string
): Promise<User | undefined> {
  const [row] = await tx
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
    .for("update")
  return row
}

async function countActiveAdmins(tx: Tx): Promise<number> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.status, "active")))
    .orderBy(asc(user.id))
    .for("update")
  return rows.length
}

function auditActor(actor: UserActor) {
  return {
    actor: { type: "user" as const, id: actor.userId },
    requestId: actor.requestId,
  }
}

export async function inviteUser(
  input: { email: string; role: string },
  actor: UserActor,
  db: Database = getDb(),
  now: Date = new Date()
): Promise<InvitationJson> {
  assertStaffRole(input.role)
  const email = normaliseEmail(input.email)
  if (!isAllowedSsoEmailDomain(email)) {
    throw AppError.validationFailed([
      {
        path: "email",
        message: "Must be a bigdropsmarketing.com address",
      },
    ])
  }

  const role = input.role
  const outcome = await db.transaction(async (tx) => {
    const identifier = invitationIdentifier(email)
    await lockInvitation(tx, identifier)

    const [existing] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    if (existing) {
      await consumeInvitation(tx, email)
      return { conflict: true as const }
    }

    const secret = createInvitationSecret()
    const value = encodeInvitationValue(role, secret)
    const expiresAt = invitationExpiresAt(now)
    const rows = await tx
      .select()
      .from(verification)
      .where(eq(verification.identifier, identifier))
      .for("update")

    const previous = rows[0]
    const previousRole = previous
      ? parseInvitationValue(previous.value)?.role
      : undefined
    let id = previous?.id
    if (previous) {
      await tx
        .update(verification)
        .set({ value, expiresAt, updatedAt: now })
        .where(eq(verification.id, previous.id))
      if (rows.length > 1) {
        for (const extra of rows.slice(1)) {
          await tx.delete(verification).where(eq(verification.id, extra.id))
        }
      }
    } else {
      id = uuidv7()
      await tx.insert(verification).values({
        id,
        identifier,
        value,
        expiresAt,
      })
    }

    if (!id) {
      throw AppError.internal()
    }

    await writeAudit(tx, {
      ...auditActor(actor),
      action: previous ? "user.invitation_replaced" : "user.invited",
      objectType: "user_invitation",
      objectId: id,
      before: previous
        ? {
            role: previousRole ?? null,
            expires_at: previous.expiresAt.toISOString(),
          }
        : null,
      after: {
        email,
        role,
        expires_at: expiresAt.toISOString(),
      },
    })

    return {
      conflict: false as const,
      invitation: serializeInvitation({
        id,
        email,
        role,
        expiresAt,
        created: !previous,
      }),
    }
  })

  if (outcome.conflict) {
    throw AppError.conflict([{ path: "email", message: "User already exists" }])
  }
  return outcome.invitation
}

export async function updateUserRole(
  userId: string,
  role: string,
  actor: UserActor,
  db: Database = getDb()
): Promise<UserJson> {
  assertStaffRole(role)
  if (isSameUser(actor.userId, userId)) {
    throw AppError.forbidden([
      { path: "userId", message: "You cannot change your own role" },
    ])
  }

  return db.transaction(async (tx) => {
    await lockActiveAdmins(tx)
    const target = await loadUserForUpdate(tx, userId)
    if (!target) {
      throw AppError.notFound([{ path: "userId", message: "User not found" }])
    }
    if (target.role === role) {
      return serializeUser(target)
    }
    if (
      removalLeavesNoActiveAdmin({
        targetIsActiveAdmin: isActiveAdmin(target),
        activeAdminCount: await countActiveAdmins(tx),
      })
    ) {
      throw AppError.conflict([
        {
          path: "role",
          message: "The last active Admin cannot be demoted",
        },
      ])
    }

    const [updated] = await tx
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, target.id))
      .returning()
    if (!updated) {
      throw AppError.internal()
    }

    await writeAudit(tx, {
      ...auditActor(actor),
      action: "user.role_changed",
      objectType: "user",
      objectId: updated.id,
      before: { role: target.role },
      after: { role: updated.role },
    })
    return serializeUser(updated)
  })
}

export async function disableUser(
  userId: string,
  actor: UserActor,
  db: Database = getDb()
): Promise<DisabledUserJson> {
  if (isSameUser(actor.userId, userId)) {
    throw AppError.forbidden([
      { path: "userId", message: "You cannot disable your own account" },
    ])
  }

  return db.transaction(async (tx) => {
    await lockActiveAdmins(tx)
    const target = await loadUserForUpdate(tx, userId)
    if (!target) {
      throw AppError.notFound([{ path: "userId", message: "User not found" }])
    }

    if (target.status === "deactivated") {
      await tx.delete(session).where(eq(session.userId, target.id))
      await deleteTrustedDevicesForUser(target.id, tx)
      return { ...serializeUser(target), already_disabled: true }
    }

    if (
      removalLeavesNoActiveAdmin({
        targetIsActiveAdmin: isActiveAdmin(target),
        activeAdminCount: await countActiveAdmins(tx),
      })
    ) {
      throw AppError.conflict([
        {
          path: "status",
          message: "The last active Admin cannot be disabled",
        },
      ])
    }

    const [updated] = await tx
      .update(user)
      .set({ status: "deactivated", updatedAt: new Date() })
      .where(eq(user.id, target.id))
      .returning()
    if (!updated) {
      throw AppError.internal()
    }

    await tx.delete(session).where(eq(session.userId, target.id))
    await deleteTrustedDevicesForUser(target.id, tx)

    await writeAudit(tx, {
      ...auditActor(actor),
      action: "user.disabled",
      objectType: "user",
      objectId: updated.id,
      before: { status: target.status, role: target.role },
      after: { status: "deactivated", role: updated.role },
    })
    return { ...serializeUser(updated), already_disabled: false }
  })
}

export async function resetManagedUserTwoFactor(
  userId: string,
  actor: UserActor,
  db: Database = getDb()
): Promise<void> {
  if (isSameUser(actor.userId, userId)) {
    throw AppError.forbidden([
      {
        path: "userId",
        message: "You cannot reset your own two-factor authentication",
      },
    ])
  }

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!existing) {
    throw AppError.notFound([{ path: "userId", message: "User not found" }])
  }

  await resetTwoFactorForAdmin(userId, {
    actorId: actor.userId,
    requestId: actor.requestId,
  })
}
