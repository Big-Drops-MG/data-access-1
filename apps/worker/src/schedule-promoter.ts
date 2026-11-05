import { send, type Send } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import {
  enqueueDispatchSendJob,
  openSendLateAlert,
  uuidSchema,
} from "@workspace/shared"
import type { Queue } from "bullmq"
import { and, eq, lte } from "drizzle-orm"

export type SchedulePromoterDeps = {
  db: Database
  dispatchQueue: Pick<
    Queue<{ send_id: string; request_id?: string }>,
    "add" | "getJob"
  >
  now?: () => Date
  enqueueDispatchSend?: (sendId: string, requestId?: string) => Promise<void>
  openLateAlert?: (
    sendId: string,
    scheduledFor: Date,
    now: Date
  ) => Promise<void>
}

export async function listDueScheduledSends(
  db: Database,
  now: Date
): Promise<Send[]> {
  return db
    .select()
    .from(send)
    .where(and(eq(send.status, "scheduled"), lte(send.scheduledFor, now)))
}

export async function processSchedulePromoterJob(
  deps: SchedulePromoterDeps
): Promise<void> {
  const now = deps.now?.() ?? new Date()
  const logger = getContextLogger()
  const enqueue =
    deps.enqueueDispatchSend ??
    ((sendId: string, requestId?: string) =>
      enqueueDispatchSendJob(deps.dispatchQueue, sendId, requestId))
  const openLate =
    deps.openLateAlert ??
    ((sendId: string, scheduledFor: Date, at: Date) =>
      openSendLateAlert(deps.db, sendId, scheduledFor, at))

  const due = await listDueScheduledSends(deps.db, now)
  let enqueued = 0

  for (const row of due) {
    const parsed = uuidSchema.safeParse(row.id)
    if (!parsed.success) {
      logger.error(
        { event: "schedule_promoter.invalid_send_id", send_id: row.id },
        "Skipping send with invalid id"
      )
      continue
    }

    try {
      await openLate(row.id, row.scheduledFor, now)
    } catch (error) {
      logger.error(
        {
          event: "schedule_promoter.late_alert_failed",
          send_id: row.id,
          err: error,
        },
        "Failed to open send_late alert"
      )
    }

    try {
      await enqueue(row.id)
      enqueued += 1
    } catch (error) {
      logger.error(
        {
          event: "schedule_promoter.enqueue_failed",
          send_id: row.id,
          err: error,
        },
        "Failed to enqueue dispatch-send"
      )
      throw error
    }
  }

  logger.info(
    {
      event: "schedule_promoter.completed",
      due_count: due.length,
      enqueued,
    },
    "Schedule promoter completed"
  )
}
