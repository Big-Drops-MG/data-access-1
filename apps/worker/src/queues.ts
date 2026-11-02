import { BULLMQ_PREFIX, SEND_EMAIL_QUEUE_NAME } from "@workspace/shared"

export { BULLMQ_PREFIX }

export const QUEUE_NAMES = [
  SEND_EMAIL_QUEUE_NAME,
  "dispatch",
  "events",
  "sync",
  "monitoring",
  "intake",
  "maintenance",
] as const

export type QueueName = (typeof QUEUE_NAMES)[number]
