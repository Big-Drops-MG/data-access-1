import {
  session,
  trustedDevice,
  twoFactor,
  user,
  verification,
} from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { and, eq, like, or } from "drizzle-orm"

import { writeAudit } from "./audit.js"
import { normaliseEmail } from "./email.js"
import { AppError } from "./errors.js"

export type Reset2faResult = {
  user_id: string
  email: string
  two_factor_deleted: boolean
  trusted_devices_deleted: number
  sessions_deleted: number
}

export async function reset2faByEmail(
  db: Database,
  email: string
): Promise<Reset2faResult> {
  const normalised = normaliseEmail(email)
  if (!normalised) {
    throw new AppError("validation_failed", 422, [
      { path: "email", message: "email is required" },
    ])
  }

  const [target] = await db
    .select({
      id: user.id,
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.email, normalised))
    .limit(1)

  if (!target) {
    throw new AppError("not_found", 404, [
      { path: "email", message: `No user found for ${normalised}` },
    ])
  }

  return db.transaction(async (tx) => {
    const deletedFactors = await tx
      .delete(twoFactor)
      .where(eq(twoFactor.userId, target.id))
      .returning({ id: twoFactor.id })

    await tx
      .delete(verification)
      .where(
        and(
          eq(verification.value, target.id),
          or(
            like(verification.identifier, "trust-device-%"),
            like(verification.identifier, "2fa-%")
          )
        )
      )

    const deletedSessions = await tx
      .delete(session)
      .where(eq(session.userId, target.id))
      .returning({ id: session.id })

    const deletedDevices = await tx
      .delete(trustedDevice)
      .where(eq(trustedDevice.userId, target.id))
      .returning({ id: trustedDevice.id })

    await tx
      .update(user)
      .set({ twoFactorEnabled: false, updatedAt: new Date() })
      .where(eq(user.id, target.id))

    await writeAudit(tx, {
      actor: { type: "system" },
      action: "user.two_factor_reset",
      objectType: "user",
      objectId: target.id,
      before: { twoFactorEnabled: target.twoFactorEnabled },
      after: {
        twoFactorEnabled: false,
        source: "ops:reset-2fa",
      },
    })

    return {
      user_id: target.id,
      email: target.email,
      two_factor_deleted: deletedFactors.length > 0,
      trusted_devices_deleted: deletedDevices.length,
      sessions_deleted: deletedSessions.length,
    }
  })
}
