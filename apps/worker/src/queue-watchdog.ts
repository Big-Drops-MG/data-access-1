import { feedbackItem, message } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import {
  closeAlert,
  enqueueSendEmailJob,
  openAlert,
  SEND_EMAIL_QUEUE_NAME,
} from "@workspace/shared"
import type { Queue } from "bullmq"
import { and, eq, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm"

import type { SchedulerDefinition } from "./schedulers.js"

export const QUEUE_WATCHDOG_JOB_NAME = "queue-watchdog"

export const SEND_EMAIL_DEPTH_THRESHOLD = 1000
export const SEND_EMAIL_DEPTH_DURATION_MS = 10 * 60_000
export const QUEUE_STALE_AGE_MS = 5 * 60_000
export const ORPHAN_QUEUED_AGE_MS = 5 * 60_000
export const FEEDBACK_PENDING_AGE_MS = 48 * 60 * 60_000
export const SCHEDULER_MISS_MULTIPLIER = 3

const DEPTH_SINCE_KEY = "watchdog:depth:send-email:since"

export type WatchdogQueue = Pick<
  Queue,
  "name" | "getJobCounts" | "getJobs" | "getJob"
>

export type WatchdogRedis = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
  del(key: string): Promise<unknown>
}

export type QueueWatchdogDeps = {
  db: Database
  queues: readonly WatchdogQueue[]
  sendEmailQueue: WatchdogQueue & Pick<Queue, "add">
  redis: WatchdogRedis
  schedulers: readonly SchedulerDefinition[]
  now?: () => Date
  openAlertFn?: typeof openAlert
  closeAlertFn?: typeof closeAlert
  enqueueOrphan?: (messageId: string) => Promise<void>
}

export type QueueStatsRow = {
  queue: string
  waiting: number
  active: number
  failed: number
  delayed: number
}

function schedulerIntervalMs(scheduler: SchedulerDefinition): number {
  if ("every" in scheduler.repeat) {
    return scheduler.repeat.every
  }
  return 24 * 60 * 60_000
}

async function collectStats(
  queues: readonly WatchdogQueue[]
): Promise<QueueStatsRow[]> {
  const rows: QueueStatsRow[] = []
  for (const queue of queues) {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "failed",
      "delayed"
    )
    rows.push({
      queue: queue.name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    })
  }
  return rows
}

async function oldestWaitingAgeMs(
  queue: WatchdogQueue,
  nowMs: number
): Promise<number | null> {
  const jobs = await queue.getJobs(["waiting", "delayed"], 0, 0)
  const job = jobs[0]
  if (!job) {
    return null
  }
  const created = job.timestamp ?? 0
  if (!created) {
    return null
  }
  return Math.max(0, nowMs - created)
}

async function lastSchedulerRunMs(
  queue: WatchdogQueue,
  jobName: string
): Promise<number | null> {
  const states = [
    "completed",
    "failed",
    "active",
    "waiting",
    "delayed",
  ] as const
  let latest: number | null = null
  for (const state of states) {
    const jobs = await queue.getJobs([state], 0, 49)
    for (const job of jobs) {
      if (job.name !== jobName) {
        continue
      }
      const stamp = job.finishedOn ?? job.processedOn ?? job.timestamp ?? null
      if (stamp != null && (latest == null || stamp > latest)) {
        latest = stamp
      }
    }
  }
  return latest
}

export async function processQueueWatchdogJob(
  deps: QueueWatchdogDeps
): Promise<void> {
  const now = deps.now?.() ?? new Date()
  const nowMs = now.getTime()
  const logger = getContextLogger()
  const open = deps.openAlertFn ?? openAlert
  const close = deps.closeAlertFn ?? closeAlert
  const enqueue =
    deps.enqueueOrphan ??
    ((messageId: string) =>
      enqueueSendEmailJob(
        deps.sendEmailQueue as Parameters<typeof enqueueSendEmailJob>[0],
        messageId
      ))

  const stats = await collectStats(deps.queues)
  logger.info(
    {
      event: "queue.stats",
      queues: Object.fromEntries(
        stats.map((row) => [
          row.queue,
          {
            waiting: row.waiting,
            active: row.active,
            failed: row.failed,
            delayed: row.delayed,
          },
        ])
      ),
    },
    "Queue stats"
  )

  const sendEmailStats = stats.find(
    (row) => row.queue === SEND_EMAIL_QUEUE_NAME
  )
  const sendWaiting = sendEmailStats?.waiting ?? 0
  if (sendWaiting > SEND_EMAIL_DEPTH_THRESHOLD) {
    const sinceRaw = await deps.redis.get(DEPTH_SINCE_KEY)
    if (!sinceRaw) {
      await deps.redis.set(DEPTH_SINCE_KEY, String(nowMs))
    } else {
      const since = Number(sinceRaw)
      if (
        Number.isFinite(since) &&
        nowMs - since >= SEND_EMAIL_DEPTH_DURATION_MS
      ) {
        await open(deps.db, {
          type: "queue_depth",
          severity: "warning",
          dedupeKey: `queue_depth:${SEND_EMAIL_QUEUE_NAME}`,
          payload: {
            queue: SEND_EMAIL_QUEUE_NAME,
            waiting: sendWaiting,
            threshold: SEND_EMAIL_DEPTH_THRESHOLD,
          },
          now,
          refreshPayload: true,
        })
      }
    }
  } else {
    await deps.redis.del(DEPTH_SINCE_KEY)
    await close(deps.db, {
      type: "queue_depth",
      dedupeKey: `queue_depth:${SEND_EMAIL_QUEUE_NAME}`,
      now,
    })
  }

  for (const queue of deps.queues) {
    const ageMs = await oldestWaitingAgeMs(queue, nowMs)
    const dedupeKey = `queue_stale:${queue.name}`
    if (ageMs != null && ageMs > QUEUE_STALE_AGE_MS) {
      await open(deps.db, {
        type: "queue_stale",
        severity: "warning",
        dedupeKey,
        payload: {
          queue: queue.name,
          oldest_waiting_age_ms: ageMs,
          threshold_ms: QUEUE_STALE_AGE_MS,
        },
        now,
        refreshPayload: true,
      })
    } else {
      await close(deps.db, { type: "queue_stale", dedupeKey, now })
    }
  }

  const queueByName = new Map(deps.queues.map((queue) => [queue.name, queue]))
  for (const scheduler of deps.schedulers) {
    const queue = queueByName.get(scheduler.queue)
    if (!queue) {
      continue
    }
    const intervalMs = schedulerIntervalMs(scheduler)
    const missAfterMs = intervalMs * SCHEDULER_MISS_MULTIPLIER
    const lastRun = await lastSchedulerRunMs(queue, scheduler.jobName)
    const dedupeKey = `scheduler:${scheduler.jobName}`
    if (lastRun == null || nowMs - lastRun > missAfterMs) {
      await open(deps.db, {
        type: "scheduler_missed",
        severity: "warning",
        dedupeKey,
        payload: {
          job_name: scheduler.jobName,
          queue: scheduler.queue,
          last_run_at: lastRun ? new Date(lastRun).toISOString() : null,
          miss_after_ms: missAfterMs,
        },
        now,
        refreshPayload: true,
      })
    } else {
      await close(deps.db, { type: "scheduler_missed", dedupeKey, now })
    }
  }

  const feedbackCutoff = new Date(nowMs - FEEDBACK_PENDING_AGE_MS)
  const pendingOld = await deps.db
    .select({ id: feedbackItem.id })
    .from(feedbackItem)
    .where(
      and(
        inArray(feedbackItem.status, ["pending", "in_review"]),
        lt(feedbackItem.createdAt, feedbackCutoff)
      )
    )
    .limit(1)

  if (pendingOld.length > 0) {
    await open(deps.db, {
      type: "feedback_pending_48h",
      severity: "info",
      dedupeKey: "feedback_pending",
      payload: { older_than_hours: 48 },
      now,
      refreshPayload: true,
    })
  } else {
    await close(deps.db, {
      type: "feedback_pending_48h",
      dedupeKey: "feedback_pending",
      now,
    })
  }

  const orphanCutoff = new Date(nowMs - ORPHAN_QUEUED_AGE_MS)
  const candidates = await deps.db
    .select({ id: message.id })
    .from(message)
    .where(
      and(
        eq(message.status, "queued"),
        or(
          and(isNotNull(message.queuedAt), lte(message.queuedAt, orphanCutoff)),
          and(
            sql`${message.queuedAt} IS NULL`,
            lte(message.createdAt, orphanCutoff)
          )
        )
      )
    )
    .limit(500)

  let requeued = 0
  for (const row of candidates) {
    const existing = await deps.sendEmailQueue.getJob(row.id)
    if (existing) {
      continue
    }
    await enqueue(row.id)
    requeued += 1
  }

  logger.info(
    {
      event: "queue_watchdog.completed",
      orphan_candidates: candidates.length,
      requeued,
    },
    "Queue watchdog completed"
  )
}
