import { SEND_EMAIL_QUEUE_NAME } from "@workspace/shared"
import type { Queue } from "bullmq"

export type BullBoardMutation =
  | { kind: "retry"; queueName: string; jobId?: string }
  | { kind: "pause"; queueName?: string }
  | { kind: "resume"; queueName?: string }
  | { kind: "clean"; queueName: string; jobId?: string; status?: string }
  | { kind: "update_data"; queueName: string; jobId: string }
  | { kind: "empty"; queueName: string }
  | { kind: "other_write" }

const WAITING_STATES = new Set([
  "waiting",
  "delayed",
  "prioritized",
  "waiting-children",
  "wait",
])

export function classifyBullBoardMutation(
  method: string,
  pathname: string
): BullBoardMutation | null {
  const normalizedMethod = method.toUpperCase()
  if (
    normalizedMethod === "GET" ||
    normalizedMethod === "HEAD" ||
    normalizedMethod === "OPTIONS"
  ) {
    return null
  }

  const path = pathname.replace(/\/+$/, "") || "/"
  const apiPrefix = "/api/queues"
  if (!path.startsWith(apiPrefix)) {
    return { kind: "other_write" }
  }

  const rest = path.slice(apiPrefix.length).replace(/^\//, "")
  const parts = rest
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))

  if (parts.length === 1 && parts[0] === "pause") {
    return { kind: "pause" }
  }
  if (parts.length === 1 && parts[0] === "resume") {
    return { kind: "resume" }
  }

  if (parts.length === 0) {
    return { kind: "other_write" }
  }

  const queueName = parts[0] ?? ""

  if (parts.length === 2 && parts[1] === "pause") {
    return { kind: "pause", queueName }
  }
  if (parts.length === 2 && parts[1] === "resume") {
    return { kind: "resume", queueName }
  }
  if (parts.length === 2 && parts[1] === "empty") {
    return { kind: "empty", queueName }
  }
  if (parts.length === 3 && parts[1] === "clean") {
    return { kind: "clean", queueName, status: parts[2] }
  }
  if (parts.length === 3 && parts[1] === "retry") {
    return { kind: "retry", queueName }
  }
  if (parts.length === 3 && parts[2] === "retry") {
    return { kind: "retry", queueName, jobId: parts[1] }
  }
  if (parts.length === 3 && parts[2] === "clean") {
    return { kind: "clean", queueName, jobId: parts[1] }
  }
  if (parts.length === 3 && parts[2] === "update-data") {
    return { kind: "update_data", queueName, jobId: parts[1] ?? "" }
  }

  return { kind: "other_write" }
}

export function auditActionForMutation(mutation: BullBoardMutation): string {
  switch (mutation.kind) {
    case "retry":
      return "queue.retry"
    case "pause":
      return "queue.pause"
    case "resume":
      return "queue.resume"
    case "clean":
      return "queue.clean"
    case "update_data":
      return "queue.update_data"
    case "empty":
      return "queue.empty"
    case "other_write":
      return "queue.write"
  }
}

function isWaitingStatus(status: string | undefined): boolean {
  if (!status) {
    return false
  }
  return WAITING_STATES.has(status.toLowerCase())
}

export async function assertBullBoardMutationAllowed(
  mutation: BullBoardMutation,
  queues: ReadonlyMap<string, Queue>
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (
    mutation.kind === "update_data" ||
    mutation.kind === "empty" ||
    mutation.kind === "other_write"
  ) {
    return {
      ok: false,
      status: 403,
      message:
        mutation.kind === "update_data"
          ? "Editing job payloads is not allowed"
          : "This queue action is not allowed",
    }
  }

  if (
    mutation.kind === "clean" &&
    mutation.queueName === SEND_EMAIL_QUEUE_NAME &&
    isWaitingStatus(mutation.status)
  ) {
    return {
      ok: false,
      status: 403,
      message: "Deleting waiting send-email jobs is not allowed",
    }
  }

  if (
    mutation.kind === "clean" &&
    mutation.queueName === SEND_EMAIL_QUEUE_NAME &&
    mutation.jobId
  ) {
    const queue = queues.get(SEND_EMAIL_QUEUE_NAME)
    if (!queue) {
      return { ok: false, status: 503, message: "send-email queue unavailable" }
    }
    const job = await queue.getJob(mutation.jobId)
    if (!job) {
      return { ok: true }
    }
    const state = await job.getState()
    if (WAITING_STATES.has(state)) {
      return {
        ok: false,
        status: 403,
        message: "Deleting waiting send-email jobs is not allowed",
      }
    }
  }

  return { ok: true }
}
