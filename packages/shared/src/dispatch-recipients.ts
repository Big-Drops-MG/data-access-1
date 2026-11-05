import { recipient, recipientPreference, type Recipient } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { and, asc, eq, gt, notExists, sql } from "drizzle-orm"

import { isTransactionalEmailType } from "./send-checks.js"
import type { TriggerEmailType } from "./trigger-email.js"

export const DISPATCH_RECIPIENT_PAGE_SIZE = 1000

export type DispatchRecipientPage = Pick<Recipient, "id" | "email">

export type LoadDispatchRecipientPageInput = {
  afterId?: string | null
  limit?: number
  categoryId: string
  emailType: TriggerEmailType
}

function clampPageLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DISPATCH_RECIPIENT_PAGE_SIZE
  }
  if (!Number.isFinite(limit) || limit < 1) {
    return 1
  }
  return Math.min(Math.floor(limit), DISPATCH_RECIPIENT_PAGE_SIZE)
}

export async function loadDispatchRecipientPage(
  db: Database | DatabaseTransaction,
  input: LoadDispatchRecipientPageInput
): Promise<DispatchRecipientPage[]> {
  const limit = clampPageLimit(input.limit)
  const afterId = input.afterId?.trim() || null

  const conditions = [eq(recipient.status, "active")]
  if (afterId) {
    conditions.push(gt(recipient.id, afterId))
  }

  if (!isTransactionalEmailType(input.emailType)) {
    conditions.push(
      notExists(
        db
          .select({ one: sql`1` })
          .from(recipientPreference)
          .where(
            and(
              eq(recipientPreference.recipientId, recipient.id),
              eq(recipientPreference.categoryId, input.categoryId),
              eq(recipientPreference.optedOut, true)
            )
          )
      )
    )
  }

  return db
    .select({
      id: recipient.id,
      email: recipient.email,
    })
    .from(recipient)
    .where(and(...conditions))
    .orderBy(asc(recipient.id))
    .limit(limit)
}
