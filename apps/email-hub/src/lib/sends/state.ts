import type { Send } from "@workspace/db"
import { AppError } from "@workspace/shared"

export const SEND_MIN_LEAD_MS = 5 * 60 * 1000

export type SendStatus = Send["status"]

const TRANSITIONS: Record<SendStatus, readonly SendStatus[]> = {
  draft: ["scheduled"],
  scheduled: ["cancelled"],
  queued: [],
  dispatching: [],
  completed: [],
  cancelled: [],
  failed: [],
}

export function canTransition(from: SendStatus, to: SendStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function assertTransition(from: SendStatus, to: SendStatus): void {
  if (!canTransition(from, to)) {
    throw AppError.conflict([
      {
        path: "status",
        message: `Cannot transition from ${from} to ${to}`,
      },
    ])
  }
}

export function assertSendEditable(status: SendStatus): void {
  if (status !== "draft") {
    throw AppError.conflict([
      {
        path: "status",
        message: "Send configuration is locked",
      },
    ])
  }
}

export function assertScheduleLeadTime(scheduledFor: Date, now: Date): void {
  if (Number.isNaN(scheduledFor.getTime()) || Number.isNaN(now.getTime())) {
    throw AppError.validationFailed([
      { path: "scheduled_for", message: "Invalid timestamp" },
    ])
  }
  if (scheduledFor.getTime() < now.getTime() + SEND_MIN_LEAD_MS) {
    throw AppError.validationFailed([
      {
        path: "scheduled_for",
        message: "Must be at least 5 minutes from now",
      },
    ])
  }
}
