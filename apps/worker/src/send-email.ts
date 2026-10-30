import { MailTransportError, type MailTransport } from "@workspace/emails"
import {
  sesSendRatePerSecond,
  uuidSchema,
  type LoadQueuedSendResult,
  type QueuedSendContext,
  type SendCheckSkipReason,
  type SendEmailJobData,
} from "@workspace/shared"
import { UnrecoverableError } from "bullmq"

export type { LoadQueuedSendResult, QueuedSendContext } from "@workspace/shared"

export const SEND_EMAIL_WORKER_CONCURRENCY = 10

const LIMITER_DURATION_MS = 1_000
const FAILURE_REASON_MAX = 500

const LOCAL_ERROR_NAMES = new Set(["Error", "MailTransportError"])

const PAUSED_NAMES = new Set([
  "AccountSendingPausedException",
  "SendingPausedException",
  "AccountSuspendedException",
])

const THROTTLE_NAMES = new Set([
  "ThrottlingException",
  "TooManyRequestsException",
  "LimitExceededException",
])

export type SendEmailJobDeps = {
  load: (messageId: string) => Promise<LoadQueuedSendResult>
  skipIfSendChecksFail: (
    context: QueuedSendContext
  ) => Promise<SendCheckSkipReason | null>
  markSent: (
    messageId: string,
    sesMessageId: string,
    sentAt: Date
  ) => Promise<void>
  markFailed: (messageId: string, failureReason: string) => Promise<void>
  claim: (messageId: string) => Promise<boolean>
  releaseClaim: (messageId: string) => Promise<void>
  transport: MailTransport
  pauseQueue: () => Promise<void>
  openAccountPausedAlert: () => Promise<void>
}

type DescribedFailure = {
  name: string
  statusCode?: number
  message: string
  localTransport: boolean
}

export type SendFailureKind = "retry" | "rejected" | "account_paused"

export function sendEmailWorkerOptions(env: {
  MAIL_TRANSPORT: "smtp" | "ses"
  SES_MAX_SEND_RATE?: string
}): {
  concurrency: number
  limiter?: { max: number; duration: number }
} {
  const rate = sesSendRatePerSecond(env)
  if (rate === undefined) {
    return { concurrency: SEND_EMAIL_WORKER_CONCURRENCY }
  }
  return {
    concurrency: SEND_EMAIL_WORKER_CONCURRENCY,
    limiter: { max: rate, duration: LIMITER_DURATION_MS },
  }
}

export function renderQueuedEmail(context: QueuedSendContext): {
  from: string
  to: string
  replyTo?: string
  subject: string
  html: string
  text: string
} {
  const replyTo = context.replyTo?.trim() ?? ""
  const text = htmlToText(context.bodySource)
  return {
    from: formatFromAddress(context.fromName, context.fromEmail),
    to: context.recipient.email,
    ...(replyTo === "" ? {} : { replyTo }),
    subject: context.subject,
    html: context.bodySource,
    text: text === "" ? context.bodySource.trim() : text,
  }
}

export function classifySendFailure(error: unknown): SendFailureKind {
  const described = describeSendFailure(error)
  if (PAUSED_NAMES.has(described.name)) {
    return "account_paused"
  }
  if (isThrottled(described)) {
    return "retry"
  }
  if (
    described.localTransport ||
    described.name === "MessageRejected" ||
    described.name.includes("Rejected") ||
    (described.statusCode !== undefined &&
      described.statusCode >= 400 &&
      described.statusCode < 500)
  ) {
    return "rejected"
  }
  return "retry"
}

export function sendFailureReason(error: unknown): string {
  const described = describeSendFailure(error)
  const text =
    described.name === "Error"
      ? described.message
      : `${described.name}: ${described.message}`
  const trimmed = text.trim()
  const reason = trimmed === "" ? "send failed" : trimmed
  return reason.slice(0, FAILURE_REASON_MAX)
}

export async function processSendEmailJob(
  data: SendEmailJobData,
  deps: SendEmailJobDeps
): Promise<void> {
  const parsedId = uuidSchema.safeParse(data.message_id)
  if (!parsedId.success) {
    throw new UnrecoverableError("send-email job message_id is invalid")
  }

  const messageId = parsedId.data
  const loaded = await deps.load(messageId)
  if (loaded.state === "missing") {
    throw new UnrecoverableError(
      `send-email message ${messageId} does not exist`
    )
  }
  if (loaded.state === "not_queued") {
    return
  }
  if (loaded.state === "unsendable") {
    await deps.markFailed(loaded.messageId, loaded.failureReason)
    throw new UnrecoverableError(loaded.failureReason)
  }

  const skipReason = await deps.skipIfSendChecksFail(loaded.context)
  if (skipReason) {
    return
  }

  const claimed = await deps.claim(messageId)
  if (!claimed) {
    return
  }

  let acceptedId: string | undefined
  try {
    const result = await deps.transport.send(renderQueuedEmail(loaded.context))
    acceptedId = result.providerMessageId.trim()
    if (acceptedId === "") {
      throw new MailTransportError("send did not return a message id")
    }
    await deps.markSent(messageId, acceptedId, new Date())
  } catch (error) {
    if (acceptedId !== undefined) {
      throw error
    }
    const kind = classifySendFailure(error)
    if (kind === "retry" || kind === "account_paused") {
      await deps.releaseClaim(messageId)
    }
    if (kind === "retry") {
      throw error
    }
    if (kind === "account_paused") {
      await deps.pauseQueue()
      await deps.openAccountPausedAlert()
      throw error
    }
    const reason = sendFailureReason(error)
    await deps.markFailed(messageId, reason)
    throw new UnrecoverableError(reason)
  }
}

function isThrottled(described: DescribedFailure): boolean {
  if (described.statusCode === 429) {
    return true
  }
  if (described.statusCode !== undefined && described.statusCode >= 500) {
    return true
  }
  return (
    THROTTLE_NAMES.has(described.name) || described.name.includes("Throttl")
  )
}

function describeSendFailure(error: unknown): DescribedFailure {
  let name = "Error"
  let statusCode: number | undefined
  let message = "send failed"
  let localTransport = false
  const seen = new Set<unknown>()
  let current: unknown = error

  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)
    if (current instanceof MailTransportError && current.cause === undefined) {
      localTransport = true
    }
    if (current instanceof Error && current.message.trim() !== "") {
      message = current.message
    }
    if (
      "name" in current &&
      typeof current.name === "string" &&
      !LOCAL_ERROR_NAMES.has(current.name)
    ) {
      name = current.name
    }
    const status = readStatusCode(current)
    if (status !== undefined) {
      statusCode = status
    }
    current = "cause" in current ? current.cause : undefined
  }

  return { name, statusCode, message, localTransport }
}

function readStatusCode(value: object): number | undefined {
  if (!("$metadata" in value)) {
    return undefined
  }
  const metadata = value.$metadata
  if (typeof metadata !== "object" || metadata === null) {
    return undefined
  }
  if (!("httpStatusCode" in metadata)) {
    return undefined
  }
  return typeof metadata.httpStatusCode === "number"
    ? metadata.httpStatusCode
    : undefined
}

function formatFromAddress(name: string, email: string): string {
  const address = email.trim()
  const display = name.trim()
  if (display === "") {
    return address
  }
  const escaped = display.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return `"${escaped}" <${address}>`
}

function htmlToText(source: string): string {
  return source
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}
