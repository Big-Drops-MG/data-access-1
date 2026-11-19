import { getRequestId, isValidRequestId } from "@workspace/logger"
import type { JobsOptions, Queue } from "bullmq"

import { isDuplicateBullmqJob } from "./dispatch-queue.js"
import { uuidSchema } from "./schemas.js"

export const MONITORING_QUEUE_NAME = "monitoring"
export const DNS_CHECK_JOB_NAME = "dns-check"
export const DNS_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
export const DNS_CHECK_WORKER_CONCURRENCY = 3

export type DnsCheckTrigger = "scheduled" | "manual"

export type DnsCheckJobData = {
  domain_id?: string
  trigger?: DnsCheckTrigger
  request_id?: string
}

export const DNS_CHECK_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 30_000 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

export function dnsCheckBucket(
  now: Date = new Date(),
  intervalMs: number = DNS_CHECK_INTERVAL_MS
): string {
  return String(Math.floor(now.getTime() / intervalMs))
}

export function dnsCheckJobId(
  domainId: string,
  bucket: string = dnsCheckBucket()
): string {
  return `dns-${domainId}-${bucket}`
}

type MonitoringQueue = Pick<Queue<DnsCheckJobData>, "add" | "getJob">

async function addDnsCheckJob(
  queue: MonitoringQueue,
  data: DnsCheckJobData,
  jobId: string
): Promise<void> {
  await queue.add(DNS_CHECK_JOB_NAME, data, {
    jobId,
    ...DNS_CHECK_JOB_OPTIONS,
  })
}

export async function enqueueDnsCheckJob(
  queue: MonitoringQueue,
  input: {
    domainId: string
    trigger?: DnsCheckTrigger
    requestId?: string
    now?: Date
  }
): Promise<void> {
  const domainId = uuidSchema.parse(input.domainId)
  const trigger = input.trigger ?? "manual"
  const payload: DnsCheckJobData = {
    domain_id: domainId,
    trigger,
  }
  const resolved = input.requestId?.trim() || getRequestId()
  if (resolved && isValidRequestId(resolved)) {
    payload.request_id = resolved
  }

  const jobId = dnsCheckJobId(domainId, dnsCheckBucket(input.now ?? new Date()))

  try {
    await addDnsCheckJob(queue, payload, jobId)
    return
  } catch (error) {
    if (!isDuplicateBullmqJob(error)) {
      throw error
    }
  }

  if (trigger !== "manual") {
    return
  }

  const existing = await queue.getJob(jobId)
  if (!existing) {
    return
  }
  const state = await existing.getState()
  if (state !== "completed" && state !== "failed") {
    return
  }
  await existing.remove()
  await addDnsCheckJob(queue, payload, jobId)
}

export function createEnqueueDnsCheck(
  queue: MonitoringQueue
): (input: {
  domainId: string
  trigger?: DnsCheckTrigger
  requestId?: string
  now?: Date
}) => Promise<void> {
  return (input) => enqueueDnsCheckJob(queue, input)
}
