import { message, type Message } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { getContextLogger, getRequestId, maskEmail } from "@workspace/logger"
import {
  AppError,
  enqueueSendEmailJob,
  triggerEmail,
  type MergeData,
  type TriggerEmailType,
} from "@workspace/shared"
import { eq } from "drizzle-orm"

import { getSendEmailQueue } from "@/lib/ext-emails/queue"
import type { ExternalEmailView } from "@/lib/ext-emails/schemas"

export type SubmitExternalEmailInput = {
  apiClientId: string
  to: string
  emailType: TriggerEmailType
  idempotencyKey: string
  offerId: string | null
  externalUserId: string | null
  mergeData?: MergeData
}

export type SubmitExternalEmailResult = {
  body: ExternalEmailView
  httpStatus: 200 | 202
}

function scopedIdempotencyKey(
  apiClientId: string,
  idempotencyKey: string
): string {
  return `ext:${apiClientId}:${idempotencyKey}`
}

function isDuplicateSendJob(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.toLowerCase().includes("already exists") ||
      error.message.toLowerCase().includes("duplicated"))
  )
}

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current)
    if ("code" in current && current.code === "23505") {
      return true
    }
    current = "cause" in current ? current.cause : undefined
  }
  return false
}

type RecordedSend = {
  message: Message
  created: boolean
}

async function findMessageByIdempotencyKey(
  idempotencyKey: string
): Promise<Message | undefined> {
  const [row] = await getDb()
    .select()
    .from(message)
    .where(eq(message.idempotencyKey, idempotencyKey))
    .limit(1)
  return row
}

async function enqueueMessage(
  messageId: string,
  requestId: string | undefined
): Promise<void> {
  try {
    await enqueueSendEmailJob(getSendEmailQueue(), messageId, requestId)
  } catch (error) {
    if (isDuplicateSendJob(error)) {
      return
    }
    throw error
  }
}

export async function submitExternalEmail(
  input: SubmitExternalEmailInput
): Promise<SubmitExternalEmailResult> {
  getSendEmailQueue()

  const requestId = getRequestId()
  const idempotencyKey = scopedIdempotencyKey(
    input.apiClientId,
    input.idempotencyKey
  )
  let enqueueFailed = false
  let result: RecordedSend
  try {
    result = await triggerEmail(
      getDb(),
      {
        email: input.to,
        idempotencyKey,
        emailType: input.emailType,
        offerId: input.offerId,
        mergeData: input.mergeData,
        externalUserId: input.externalUserId,
        requestId,
      },
      {
        enqueueSendEmail: async (messageId, queuedRequestId) => {
          try {
            await enqueueMessage(messageId, queuedRequestId ?? requestId)
          } catch (error) {
            enqueueFailed = true
            throw error
          }
        },
      }
    )
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    const existing = await findMessageByIdempotencyKey(idempotencyKey)
    if (!existing) {
      throw error
    }
    result = { message: existing, created: false }
  }

  const needsEnqueue =
    result.message.status === "queued" && (!result.created || enqueueFailed)

  if (needsEnqueue) {
    try {
      await enqueueMessage(result.message.id, requestId)
    } catch (error) {
      getContextLogger().error(
        {
          event: "ext.email.queue_failed",
          message_id: result.message.id,
          api_client_id: input.apiClientId,
          err: error,
        },
        "External email queue failed"
      )
      throw AppError.unavailable([
        { path: "queue", message: "Send queue unavailable" },
      ])
    }
  }

  const httpStatus: 200 | 202 =
    result.created && result.message.status === "queued" ? 202 : 200
  const view: ExternalEmailView = {
    message_id: result.message.id,
    status: result.message.status,
  }

  getContextLogger().info(
    {
      event: httpStatus === 202 ? "ext.email.accepted" : "ext.email.recorded",
      message_id: view.message_id,
      detail: view.status,
      recipient: maskEmail(input.to),
      api_client_id: input.apiClientId,
    },
    httpStatus === 202 ? "External email accepted" : "External email recorded"
  )

  return { body: view, httpStatus }
}

export async function getExternalEmailStatus(
  messageId: string,
  apiClientId: string
): Promise<ExternalEmailView> {
  const [row] = await getDb()
    .select({
      id: message.id,
      status: message.status,
    })
    .from(message)
    .where(eq(message.id, messageId))
    .limit(1)

  if (!row) {
    getContextLogger().info(
      {
        event: "ext.email.status_miss",
        message_id: messageId,
        api_client_id: apiClientId,
      },
      "External email status miss"
    )
    throw AppError.notFound([{ path: "message_id", message: "Not found" }])
  }

  getContextLogger().info(
    {
      event: "ext.email.status",
      message_id: row.id,
      detail: row.status,
      api_client_id: apiClientId,
    },
    "External email status"
  )

  return {
    message_id: row.id,
    status: row.status,
  }
}
