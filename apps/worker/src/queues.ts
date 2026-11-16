import {
  BULLMQ_PREFIX,
  EVENTS_QUEUE_NAME,
  INTAKE_QUEUE_NAME,
  SEND_EMAIL_QUEUE_NAME,
} from "@workspace/shared"

export { BULLMQ_PREFIX }

export const QUEUE_NAMES = [
  SEND_EMAIL_QUEUE_NAME,
  "dispatch",
  EVENTS_QUEUE_NAME,
  "sync",
  "monitoring",
  INTAKE_QUEUE_NAME,
  "maintenance",
] as const

export type QueueName = (typeof QUEUE_NAMES)[number]
