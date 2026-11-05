import { send, type Send } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { getContextLogger, maskEmail } from "@workspace/logger"
import {
  DISPATCH_RECIPIENT_PAGE_SIZE,
  loadDispatchRecipientPage,
  openSendLateAlert,
  triggerEmail,
  uuidSchema,
  type DispatchSendJobData,
  type MessageEnvironment,
  type TriggerEmailDeps,
  type TriggerEmailType,
} from "@workspace/shared"
import { UnrecoverableError } from "bullmq"
import { and, eq } from "drizzle-orm"

export type DispatchSendDeps = {
  db: Database
  enqueueSendEmail: TriggerEmailDeps["enqueueSendEmail"]
  now?: () => Date
  loadRecipientPage?: typeof loadDispatchRecipientPage
  trigger?: typeof triggerEmail
  openLateAlert?: (
    sendId: string,
    scheduledFor: Date,
    now: Date
  ) => Promise<void>
}

const TERMINAL_STATUSES = new Set<Send["status"]>([
  "completed",
  "cancelled",
  "failed",
  "draft",
])

const CLAIMABLE_STATUSES = new Set<Send["status"]>(["scheduled", "dispatching"])

function toTriggerEmailType(emailType: Send["emailType"]): TriggerEmailType {
  if (
    emailType === "thank_you" ||
    emailType === "feedback_request" ||
    emailType === "engagement"
  ) {
    return emailType
  }
  throw new UnrecoverableError(`Unsupported send email_type: ${emailType}`)
}

export async function loadSendById(
  db: Database,
  sendId: string
): Promise<Send | null> {
  const [row] = await db.select().from(send).where(eq(send.id, sendId)).limit(1)
  return row ?? null
}

export async function claimSendForDispatch(
  db: Database,
  sendId: string,
  now: Date
): Promise<Send | null> {
  const [claimed] = await db
    .update(send)
    .set({
      status: "dispatching",
      dispatchStartedAt: now,
      updatedAt: now,
    })
    .where(and(eq(send.id, sendId), eq(send.status, "scheduled")))
    .returning()

  if (claimed) {
    return claimed
  }

  const current = await loadSendById(db, sendId)
  if (current?.status === "dispatching") {
    return current
  }
  return null
}

export async function completeSend(
  db: Database,
  sendId: string,
  now: Date
): Promise<Send | null> {
  const [completed] = await db
    .update(send)
    .set({
      status: "completed",
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(send.id, sendId), eq(send.status, "dispatching")))
    .returning()
  return completed ?? null
}

export async function processDispatchSendJob(
  data: DispatchSendJobData,
  deps: DispatchSendDeps
): Promise<void> {
  const parsedId = uuidSchema.safeParse(data.send_id)
  if (!parsedId.success) {
    throw new UnrecoverableError("Invalid send_id")
  }
  const sendId = parsedId.data
  const now = deps.now?.() ?? new Date()
  const logger = getContextLogger()
  const loadPage = deps.loadRecipientPage ?? loadDispatchRecipientPage
  const runTrigger = deps.trigger ?? triggerEmail
  const openLate =
    deps.openLateAlert ??
    ((id: string, scheduledFor: Date, at: Date) =>
      openSendLateAlert(deps.db, id, scheduledFor, at))

  const existing = await loadSendById(deps.db, sendId)
  if (!existing) {
    throw new UnrecoverableError("Send not found")
  }
  if (TERMINAL_STATUSES.has(existing.status)) {
    logger.info(
      {
        event: "dispatch_send.skipped_terminal",
        send_id: sendId,
        status: existing.status,
      },
      "Dispatch skipped for terminal send"
    )
    return
  }
  if (!CLAIMABLE_STATUSES.has(existing.status)) {
    throw new UnrecoverableError(
      `Send status ${existing.status} is not dispatchable`
    )
  }

  const active =
    existing.status === "dispatching"
      ? existing
      : await claimSendForDispatch(deps.db, sendId, now)

  if (!active) {
    const again = await loadSendById(deps.db, sendId)
    if (again && TERMINAL_STATUSES.has(again.status)) {
      return
    }
    throw new Error("Failed to claim send for dispatch")
  }

  try {
    await openLate(sendId, active.scheduledFor, now)
  } catch (error) {
    logger.error(
      {
        event: "dispatch_send.late_alert_failed",
        send_id: sendId,
        err: error,
      },
      "Failed to open send_late alert"
    )
  }

  const emailType = toTriggerEmailType(active.emailType)
  let afterId: string | null = null
  let processed = 0
  let pages = 0

  for (;;) {
    const [current] = await deps.db
      .select({ status: send.status })
      .from(send)
      .where(eq(send.id, sendId))
      .limit(1)

    if (!current || current.status === "cancelled") {
      logger.info(
        {
          event: "dispatch_send.cancelled",
          send_id: sendId,
          processed,
          pages,
        },
        "Dispatch stopped after cancel"
      )
      return
    }
    if (current.status !== "dispatching") {
      throw new UnrecoverableError(
        `Send left dispatching unexpectedly (${current.status})`
      )
    }

    const page = await loadPage(deps.db, {
      afterId,
      limit: DISPATCH_RECIPIENT_PAGE_SIZE,
      categoryId: active.categoryId,
      emailType,
    })
    if (page.length === 0) {
      break
    }
    pages += 1

    for (const row of page) {
      const idempotencyKey = `${sendId}:${row.id}`
      try {
        await runTrigger(
          deps.db,
          {
            email: row.email,
            emailType,
            offerId: active.offerId,
            idempotencyKey,
            templateVersionId: active.templateVersionId,
            senderId: active.senderId,
            sendId,
            environment: "production" satisfies MessageEnvironment,
          },
          { enqueueSendEmail: deps.enqueueSendEmail }
        )
        processed += 1
      } catch (error) {
        logger.error(
          {
            event: "dispatch_send.recipient_failed",
            send_id: sendId,
            recipient_id: row.id,
            recipient: maskEmail(row.email),
            err: error,
          },
          "Failed to trigger email for recipient"
        )
        throw error
      }
    }

    afterId = page[page.length - 1]?.id ?? afterId
    if (page.length < DISPATCH_RECIPIENT_PAGE_SIZE) {
      break
    }
  }

  const completed = await completeSend(deps.db, sendId, now)
  if (!completed) {
    const [statusRow] = await deps.db
      .select({ status: send.status })
      .from(send)
      .where(eq(send.id, sendId))
      .limit(1)
    if (statusRow?.status === "cancelled") {
      logger.info(
        {
          event: "dispatch_send.cancelled_before_complete",
          send_id: sendId,
          processed,
          pages,
        },
        "Dispatch stopped after cancel"
      )
      return
    }
    if (statusRow?.status === "completed") {
      return
    }
    throw new Error("Failed to mark send completed")
  }

  logger.info(
    {
      event: "dispatch_send.completed",
      send_id: sendId,
      processed,
      pages,
    },
    "Dispatch send completed"
  )
}
