import {
  BULLMQ_PREFIX,
  EVENTS_QUEUE_NAME,
  SEND_EMAIL_QUEUE_NAME,
} from "@workspace/shared"

export { BULLMQ_PREFIX }

export const ADMIN_QUEUE_NAMES = [
  SEND_EMAIL_QUEUE_NAME,
  "dispatch",
  EVENTS_QUEUE_NAME,
  "sync",
  "monitoring",
  "intake",
  "maintenance",
] as const

export type AdminQueueName = (typeof ADMIN_QUEUE_NAMES)[number]

export const SEND_EMAIL_QUEUE = SEND_EMAIL_QUEUE_NAME
