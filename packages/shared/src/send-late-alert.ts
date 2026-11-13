import type { Database, DatabaseTransaction } from "@workspace/db/client"

import { closeAlert, openAlert, type CloseAlertResult } from "./alerts.js"
import {
  SEND_LATE_ALERT_TYPE,
  isSendLate,
  sendLateAlertDedupeKey,
} from "./dispatch-queue.js"

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

  const minutesLate = Math.floor(
    (now.getTime() - scheduledFor.getTime()) / 60_000
  )

  await openAlert(db, {
    type: SEND_LATE_ALERT_TYPE,
    severity: "warning",
    dedupeKey: sendLateAlertDedupeKey(sendId),
    now,
    refreshPayload: true,
    payload: {
      send_id: sendId,
      scheduled_for: scheduledFor.toISOString(),
      minutes_late: minutesLate,
    },
  })
}

export async function closeSendLateAlert(
  db: AlertDb,
  sendId: string,
  now?: Date
): Promise<CloseAlertResult> {
  return closeAlert(db, {
    type: SEND_LATE_ALERT_TYPE,
    dedupeKey: sendLateAlertDedupeKey(sendId),
    now,
  })
}
