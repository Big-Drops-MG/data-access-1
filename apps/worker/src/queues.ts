export const BULLMQ_PREFIX = "bd"

export const QUEUE_NAMES = [
  "send-email",
  "dispatch",
  "events",
  "sync",
  "monitoring",
  "intake",
  "maintenance",
] as const

export type QueueName = (typeof QUEUE_NAMES)[number]
