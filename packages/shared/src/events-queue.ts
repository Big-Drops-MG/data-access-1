import type { EmailEventType } from "@workspace/db/clickhouse"
import { getRequestId, isValidRequestId } from "@workspace/logger"
import type { JobsOptions, Queue } from "bullmq"

import { BULLMQ_PREFIX } from "./send-email-queue.js"

export { BULLMQ_PREFIX }

export const EVENTS_QUEUE_NAME = "events"
export const EVENTS_JOB_NAME = "events-writer"

/** Default options for events-writer jobs (T-062). */
export const EVENTS_JOB_OPTIONS = {
  attempts: 10,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { age: 86_400, count: 50_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

export type NormalizedEmailEventRecord = {
  event_id: string
  event_type: EmailEventType
  event_time: string
  ses_message_id: string
  recipient_emails?: string[]
  bounce_type?: string | null
  bounce_subtype?: string | null
  smtp_status?: string | null
  smtp_diagnostic?: string | null
  delay_type?: string | null
  complaint_type?: string | null
  link_url?: string | null
  user_agent?: string | null
  raw_payload?: string
}

export type EventsJobData = {
  sns_message_id: string
  message_id?: string
  request_id?: string
  workspace_id?: string
  environment?: string
  event_type?: string
  event_timestamp?: string
  records: NormalizedEmailEventRecord[]
}

export type EventsQueue = Pick<Queue<EventsJobData>, "add">

/**
 * Enqueue an events-writer job for a verified SES/SNS event.
 * `jobId` equals `sns_message_id` for idempotency and deduplication.
 */
export async function enqueueEventsJob(
  queue: EventsQueue,
  jobData: EventsJobData
): Promise<void> {
  const resolvedRequestId = jobData.request_id?.trim() || getRequestId()
  const data: EventsJobData = {
    ...jobData,
    ...(resolvedRequestId && isValidRequestId(resolvedRequestId)
      ? { request_id: resolvedRequestId }
      : {}),
  }

  await queue.add(EVENTS_JOB_NAME, data, {
    jobId: jobData.sns_message_id,
    ...EVENTS_JOB_OPTIONS,
  })
}

/** Build the `enqueueEvents` dependency for SES webhook processing. */
export function createEnqueueEvents(
  queue: EventsQueue
): (jobData: EventsJobData) => Promise<void> {
  return (jobData) => enqueueEventsJob(queue, jobData)
}

/**
 * Map incoming SES event notification types to ClickHouse `EmailEventType`.
 */
export function mapSesEventTypeToClickHouse(
  eventType: string,
  bounceType?: string | null
): EmailEventType | null {
  const norm = eventType.toLowerCase().replace(/[\s_-]+/g, "")
  switch (norm) {
    case "send":
      return "sent"
    case "delivery":
      return "delivered"
    case "bounce": {
      const bt = (bounceType ?? "").trim().toLowerCase()
      if (bt === "transient" || bt === "undetermined") {
        return "bounce_soft"
      }
      return "bounce_hard"
    }
    case "complaint":
      return "complaint"
    case "reject":
    case "renderingfailure":
      return "reject"
    case "deliverydelay":
      return "delivery_delay"
    case "open":
      return "open"
    case "click":
      return "click"
    case "subscription":
    case "unsubscribe":
      return "unsubscribe"
    default:
      return null
  }
}

/**
 * Extract clean lowercase domain from an email address or header string.
 */
export function extractDomain(emailOrAddress?: string | null): string {
  if (!emailOrAddress || typeof emailOrAddress !== "string") {
    return ""
  }
  const match = /@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/.exec(emailOrAddress.trim())
  return match?.[1]?.toLowerCase() ?? ""
}

export type ParsedUserAgentEnvironment = {
  client: string
  device_type: string
  os: string
  country: string
  region: string
  is_machine: number
  machine_reason: string
}

/**
 * Parse client, OS, device type, and machine bot/proxy signals from a User-Agent string.
 */
export function parseUserAgentEnvironment(
  userAgent?: string | null
): ParsedUserAgentEnvironment {
  if (!userAgent || typeof userAgent !== "string") {
    return {
      client: "",
      device_type: "",
      os: "",
      country: "",
      region: "",
      is_machine: 0,
      machine_reason: "",
    }
  }

  const ua = userAgent.trim()
  const lower = ua.toLowerCase()

  let isMachine = 0
  let machineReason = ""

  if (lower.includes("googleimageproxy")) {
    isMachine = 1
    machineReason = "google_proxy"
  } else if (
    lower.includes("applewebkit") &&
    lower.includes("mozilla/5.0") &&
    !lower.includes("safari") &&
    !lower.includes("chrome") &&
    !lower.includes("firefox")
  ) {
    isMachine = 1
    machineReason = "apple_mpp"
  } else if (
    lower.includes("yahoo! slurp") ||
    lower.includes("yahoo! mailproxy")
  ) {
    isMachine = 1
    machineReason = "yahoo_proxy"
  } else if (
    lower.includes("bot") ||
    lower.includes("crawler") ||
    lower.includes("spider") ||
    lower.includes("fetcher")
  ) {
    isMachine = 1
    machineReason = "crawler"
  }

  let os = ""
  if (
    lower.includes("iphone") ||
    lower.includes("ipad") ||
    lower.includes("ipod")
  ) {
    os = "iOS"
  } else if (lower.includes("mac os") || lower.includes("macintosh")) {
    os = "macOS"
  } else if (lower.includes("windows")) {
    os = "Windows"
  } else if (lower.includes("android")) {
    os = "Android"
  } else if (lower.includes("linux")) {
    os = "Linux"
  }

  let deviceType = "desktop"
  if (lower.includes("ipad") || lower.includes("tablet")) {
    deviceType = "tablet"
  } else if (
    lower.includes("iphone") ||
    lower.includes("mobile") ||
    (lower.includes("android") && !lower.includes("tablet"))
  ) {
    deviceType = "mobile"
  }

  let client = ""
  if (lower.includes("thunderbird")) {
    client = "Thunderbird"
  } else if (lower.includes("outlook") || lower.includes("office")) {
    client = "Outlook"
  } else if (lower.includes("googleimageproxy") || lower.includes("gmail")) {
    client = "Gmail"
  } else if (
    lower.includes("apple mail") ||
    (lower.includes("macintosh") && lower.includes("mail"))
  ) {
    client = "Apple Mail"
  } else if (lower.includes("chrome") && !lower.includes("edg")) {
    client = "Chrome"
  } else if (lower.includes("safari") && !lower.includes("chrome")) {
    client = "Safari"
  } else if (lower.includes("firefox")) {
    client = "Firefox"
  } else if (lower.includes("edg")) {
    client = "Edge"
  }

  return {
    client,
    device_type: deviceType,
    os,
    country: "",
    region: "",
    is_machine: isMachine,
    machine_reason: machineReason,
  }
}
