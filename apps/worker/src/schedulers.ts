import { ET_TIME_ZONE } from "@workspace/shared"
import type { JobsOptions, Queue } from "bullmq"

import type { QueueName } from "./queues.js"

export const SCHEDULER_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions

export type SchedulerRepeat =
  { every: number } | { pattern: string; tz: typeof ET_TIME_ZONE }

export type SchedulerDefinition = {
  id: string
  queue: Exclude<QueueName, "send-email" | "events">
  jobName: string
  repeat: SchedulerRepeat
  enabledInDev: boolean
  opts: JobsOptions
}

export const SCHEDULER_DEFINITIONS: readonly SchedulerDefinition[] = [
  {
    id: "schedule-promoter",
    queue: "dispatch",
    jobName: "schedule-promoter",
    repeat: { every: 60_000 },
    enabledInDev: true,
    opts: { attempts: 1, ...SCHEDULER_DEFAULT_JOB_OPTIONS },
  },
  {
    id: "ses-health",
    queue: "monitoring",
    jobName: "ses-health",
    repeat: { every: 5 * 60_000 },
    enabledInDev: true,
    opts: { attempts: 1, ...SCHEDULER_DEFAULT_JOB_OPTIONS },
  },
  {
    id: "dns-check",
    queue: "monitoring",
    jobName: "dns-check",
    repeat: { every: 6 * 60 * 60_000 },
    enabledInDev: true,
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
      ...SCHEDULER_DEFAULT_JOB_OPTIONS,
    },
  },
  {
    id: "blocklist-check",
    queue: "monitoring",
    jobName: "blocklist-check",
    repeat: { every: 6 * 60 * 60_000 },
    enabledInDev: false,
    opts: {
      attempts: 2,
      backoff: { type: "fixed", delay: 60_000 },
      ...SCHEDULER_DEFAULT_JOB_OPTIONS,
    },
  },
  {
    id: "provider-metrics-pull",
    queue: "monitoring",
    jobName: "provider-metrics-pull",
    repeat: { pattern: "0 8 * * *", tz: ET_TIME_ZONE },
    enabledInDev: false,
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10 * 60_000 },
      ...SCHEDULER_DEFAULT_JOB_OPTIONS,
    },
  },
  {
    id: "seed-placement-check",
    queue: "monitoring",
    jobName: "seed-placement-check",
    repeat: { every: 30 * 60_000 },
    enabledInDev: true,
    opts: {
      attempts: 2,
      backoff: { type: "fixed", delay: 60_000 },
      ...SCHEDULER_DEFAULT_JOB_OPTIONS,
    },
  },
  {
    id: "imap-intake",
    queue: "intake",
    jobName: "imap-intake",
    repeat: { every: 2 * 60_000 },
    enabledInDev: true,
    opts: { attempts: 1, ...SCHEDULER_DEFAULT_JOB_OPTIONS },
  },
  {
    id: "optizmo-sync",
    queue: "sync",
    jobName: "optizmo-sync",
    repeat: { pattern: "0 3 * * *", tz: ET_TIME_ZONE },
    enabledInDev: false,
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      ...SCHEDULER_DEFAULT_JOB_OPTIONS,
    },
  },
  {
    id: "cleanup-expired",
    queue: "maintenance",
    jobName: "cleanup-expired",
    repeat: { pattern: "0 4 * * *", tz: ET_TIME_ZONE },
    enabledInDev: true,
    opts: { attempts: 1, ...SCHEDULER_DEFAULT_JOB_OPTIONS },
  },
  {
    id: "queue-watchdog",
    queue: "maintenance",
    jobName: "queue-watchdog",
    repeat: { every: 60_000 },
    enabledInDev: true,
    opts: { attempts: 1, ...SCHEDULER_DEFAULT_JOB_OPTIONS },
  },
] as const

export function schedulersForEnv(
  emailhubEnv: string | undefined
): readonly SchedulerDefinition[] {
  const isDev = emailhubEnv === "dev"
  return SCHEDULER_DEFINITIONS.filter((entry) => entry.enabledInDev || !isDev)
}

export type SchedulerQueueMap = Partial<
  Record<SchedulerDefinition["queue"], Queue>
>

export async function registerJobSchedulers(
  queues: SchedulerQueueMap,
  emailhubEnv: string | undefined
): Promise<string[]> {
  const registered: string[] = []

  for (const entry of schedulersForEnv(emailhubEnv)) {
    const queue = queues[entry.queue]
    if (!queue) {
      throw new Error(`Missing queue for scheduler ${entry.id}: ${entry.queue}`)
    }

    const repeatOpts =
      "every" in entry.repeat
        ? { every: entry.repeat.every }
        : { pattern: entry.repeat.pattern, tz: entry.repeat.tz }

    await queue.upsertJobScheduler(entry.id, repeatOpts, {
      name: entry.jobName,
      data: {},
      opts: entry.opts,
    })
    registered.push(entry.id)
  }

  return registered
}
