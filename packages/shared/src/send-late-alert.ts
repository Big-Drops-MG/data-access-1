import { alert } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { and, eq, sql } from "drizzle-orm"

import {
  SEND_LATE_ALERT_TYPE,
  isSendLate,
  sendLateAlertDedupeKey,
} from "./dispatch-queue.js"
import { isUniqueViolation } from "./postgres-errors.js"

type AlertDb = Database | DatabaseTransaction

export async function openSendLateAlert(
  db: AlertDb,
  sendId: string,
  scheduledFor: Date,
  now: Date = new Date()
): Promise<void> {
  if (!isSendLate(scheduledFor, now)) {
    return
  }

  const dedupeKey = sendLateAlertDedupeKey(sendId)
  const minutesLate = Math.floor(
    (now.getTime() - scheduledFor.getTime()) / 60_000
  )

  try {
    await db.insert(alert).values({
      type: SEND_LATE_ALERT_TYPE,
      severity: "warning",
      status: "open",
      dedupeKey,
      payload: {
        send_id: sendId,
        scheduled_for: scheduledFor.toISOString(),
        minutes_late: minutesLate,
      },
    })
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    await db
      .update(alert)
      .set({
        lastTriggeredAt: now,
        occurrenceCount: sql`${alert.occurrenceCount} + 1`,
        updatedAt: now,
        payload: {
          send_id: sendId,
          scheduled_for: scheduledFor.toISOString(),
          minutes_late: minutesLate,
        },
      })
      .where(and(eq(alert.dedupeKey, dedupeKey), eq(alert.status, "open")))
  }
}
