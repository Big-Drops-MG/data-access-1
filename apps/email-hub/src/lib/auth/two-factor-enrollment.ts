import { eq } from "drizzle-orm"
import { twoFactor, user } from "@workspace/db"
import { getDb } from "@workspace/db/client"

/**
 * Source-of-truth enrolment check for routing: new users → setup (QR/key),
 * enrolled users → verify (TOTP only).
 */
export async function userHasTwoFactorEnrolled(
  userId: string
): Promise<boolean> {
  const [row] = await getDb()
    .select({
      twoFactorEnabled: user.twoFactorEnabled,
      factorId: twoFactor.id,
    })
    .from(user)
    .leftJoin(twoFactor, eq(twoFactor.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1)

  if (!row) {
    return false
  }
  return row.twoFactorEnabled === true && row.factorId != null
}
