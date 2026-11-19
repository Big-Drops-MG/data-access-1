import { getDb } from "@workspace/db/client"
import { closeClickHouseClient } from "@workspace/db/clickhouse"
import {
  createMailTransport,
  getSesEmailIdentityVerification,
} from "@workspace/emails"
import {
  WORKER_SERVICE,
  createLogger,
  getContextLogger,
  readJobCorrelation,
  resolveRequestId,
  runWithRequestContext,
  setFallbackLogger,
} from "@workspace/logger"
import {
  AROHAA_TIER_SYNC_JOB_NAME,
  CSV_INGEST_JOB_NAME,
  DISPATCH_QUEUE_NAME,
  DISPATCH_SEND_JOB_NAME,
  DNS_CHECK_JOB_NAME,
  DNS_CHECK_WORKER_CONCURRENCY,
  EVENTS_QUEUE_NAME,
  INTAKE_QUEUE_NAME,
  MONITORING_QUEUE_NAME,
  OPTIZMO_SYNC_JOB_NAME,
  OPTIZMO_SYNC_WORKER_CONCURRENCY,
  SCHEDULE_PROMOTER_JOB_NAME,
  SYNC_QUEUE_NAME,
  claimQueuedMessage,
  createEnqueueSendEmail,
  loadQueuedSend,
  loadServerEnv,
  markMessageFailed,
  markMessageSent,
  openSesAccountPausedAlert,
  processDnsCheckJob,
  releaseQueuedClaim,
  resolveUnsubscribeOrigin,
  runSendEmailExclusive,
  SEND_EMAIL_QUEUE_NAME,
  skipQueuedMessageIfBlocked,
  type ArohaaTierSyncJobData,
  type CsvIngestJobData,
  type DispatchSendJobData,
  type DnsCheckJobData,
  type EventsJobData,
  type OptizmoSyncJobData,
  type SendEmailJobData,
} from "@workspace/shared"
import { Queue, Worker, type Job } from "bullmq"
import { Redis } from "ioredis"

import { handleArohaaTierSyncJob } from "./arohaa-tier-sync.js"
import {
  CLEANUP_EXPIRED_JOB_NAME,
  processCleanupExpiredJob,
} from "./cleanup-expired.js"
import { processCsvIngestJob } from "./csv-ingest.js"
import { processDispatchSendJob } from "./dispatch-send.js"
import { processEventsJob } from "./events-writer.js"
import { handleOptizmoSyncJob } from "./optizmo-sync.js"
import { processProviderMetricsPull } from "./provider-metrics-pull.js"
import {
  attachProcessFailureHandlers,
  attachWorkerFailureHandlers,
} from "./job-failure.js"
import {
  QUEUE_WATCHDOG_JOB_NAME,
  processQueueWatchdogJob,
} from "./queue-watchdog.js"
import { BULLMQ_PREFIX, QUEUE_NAMES, type QueueName } from "./queues.js"
import { processSchedulePromoterJob } from "./schedule-promoter.js"
import {
  registerJobSchedulers,
  schedulersForEnv,
  type SchedulerQueueMap,
} from "./schedulers.js"
import { processSendEmailJob, sendEmailWorkerOptions } from "./send-email.js"

const DISPATCH_WORKER_CONCURRENCY = 2
const INTAKE_WORKER_CONCURRENCY = 1
const MAINTENANCE_WORKER_CONCURRENCY = 1
const PROVIDER_METRICS_PULL_JOB = "provider-metrics-pull"

const logger = createLogger({ service: WORKER_SERVICE })
setFallbackLogger(logger)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function correlationIdFor(job: Job): Promise<string> {
  const existing = readJobCorrelation(job.data).requestId
  if (existing) {
    return existing
  }

  const requestId = resolveRequestId(undefined)
  if (isPlainRecord(job.data)) {
    try {
      await job.updateData({ ...job.data, request_id: requestId })
    } catch (error) {
      logger.warn(
        {
          event: "job.request_id_persist_failed",
          job_id: job.id,
          err: error,
        },
        "Could not persist request_id"
      )
    }
  }
  return requestId
}

async function withJobLogs(
  queueName: QueueName,
  job: Job,
  run: () => Promise<void>
): Promise<void> {
  const correlation = readJobCorrelation(job.data)
  const requestId = await correlationIdFor(job)
  const started = Date.now()
  const attempt = job.attemptsMade + 1
  const jobLogger = logger.child({
    request_id: requestId,
    ...(job.id ? { job_id: job.id } : {}),
    ...(correlation.messageId ? { message_id: correlation.messageId } : {}),
    ...(correlation.workspaceId
      ? { workspace_id: correlation.workspaceId }
      : {}),
  })

  await runWithRequestContext(
    requestId,
    async () => {
      const scoped = getContextLogger()

      if (job.attemptsMade > 0) {
        scoped.warn(
          { event: "job.retry", queue: queueName, attempt },
          "Job retry"
        )
      }

      scoped.info(
        { event: "job.started", queue: queueName, attempt },
        "Job started"
      )

      await run()
      scoped.info(
        {
          event: "job.completed",
          queue: queueName,
          duration_ms: Date.now() - started,
        },
        "Job completed"
      )
    },
    jobLogger
  )
}

async function main(): Promise<void> {
  const env = loadServerEnv("worker")
  const sendOptions = sendEmailWorkerOptions(env)
  const db = getDb()
  const transport = createMailTransport(env)
  const sesRegion = env.SES_REGION?.trim() || ""

  attachProcessFailureHandlers()

  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  })
  const queueConnection = connection.duplicate()

  await connection.ping()

  const sendEmailQueue = new Queue(SEND_EMAIL_QUEUE_NAME, {
    connection: queueConnection,
    prefix: BULLMQ_PREFIX,
  })
  const enqueueSendEmail = createEnqueueSendEmail(sendEmailQueue)

  const schedulerQueues: SchedulerQueueMap = {}
  const managedQueues: Queue[] = [sendEmailQueue]
  let dispatchQueue: Queue | undefined
  let syncQueue: Queue | undefined
  let monitoringQueue: Queue | undefined
  for (const name of QUEUE_NAMES) {
    if (name === SEND_EMAIL_QUEUE_NAME) {
      continue
    }
    const queue = new Queue(name, {
      connection: queueConnection,
      prefix: BULLMQ_PREFIX,
    })
    managedQueues.push(queue)
    if (name === DISPATCH_QUEUE_NAME) {
      dispatchQueue = queue
    }
    if (name === SYNC_QUEUE_NAME) {
      syncQueue = queue
    }
    if (name === MONITORING_QUEUE_NAME) {
      monitoringQueue = queue
    }
    if (
      name === DISPATCH_QUEUE_NAME ||
      name === MONITORING_QUEUE_NAME ||
      name === INTAKE_QUEUE_NAME ||
      name === SYNC_QUEUE_NAME ||
      name === "maintenance"
    ) {
      schedulerQueues[name] = queue
    }
  }

  if (!dispatchQueue) {
    throw new Error("Dispatch queue failed to initialize")
  }
  if (!syncQueue) {
    throw new Error("Sync queue failed to initialize")
  }
  if (!monitoringQueue) {
    throw new Error("Monitoring queue failed to initialize")
  }
  const activeDispatchQueue = dispatchQueue
  const activeSyncQueue = syncQueue
  const activeMonitoringQueue = monitoringQueue

  const schedulerIds = await registerJobSchedulers(
    schedulerQueues,
    env.EMAILHUB_ENV
  )
  logger.info(
    {
      event: "schedulers.registered",
      scheduler_ids: schedulerIds,
      emailhub_env: env.EMAILHUB_ENV,
    },
    "Job schedulers registered"
  )

  const workers: Worker[] = []

  workers.push(
    new Worker(
      "maintenance",
      (job) =>
        withJobLogs("maintenance", job, async () => {
          if (job.name === QUEUE_WATCHDOG_JOB_NAME) {
            await processQueueWatchdogJob({
              db,
              queues: managedQueues,
              sendEmailQueue,
              redis: connection,
              schedulers: schedulersForEnv(env.EMAILHUB_ENV),
            })
            return
          }
          if (job.name === CLEANUP_EXPIRED_JOB_NAME) {
            await processCleanupExpiredJob({ db })
            return
          }
          logger.warn(
            {
              event: "maintenance.unknown_job",
              job_name: job.name,
              job_id: job.id,
            },
            "Ignoring unknown maintenance job"
          )
        }),
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: MAINTENANCE_WORKER_CONCURRENCY,
      }
    )
  )

  workers.push(
    new Worker(
      MONITORING_QUEUE_NAME,
      (job) =>
        withJobLogs(MONITORING_QUEUE_NAME, job, async () => {
          if (job.name === PROVIDER_METRICS_PULL_JOB) {
            await processProviderMetricsPull({ db, env })
            return
          }
          if (job.name === DNS_CHECK_JOB_NAME) {
            await processDnsCheckJob(job.data as DnsCheckJobData, {
              db,
              monitoringQueue: activeMonitoringQueue,
              getSesIdentityVerified: sesRegion
                ? async (domainName) => {
                    const identity = await getSesEmailIdentityVerification({
                      domainName,
                      region: sesRegion,
                    })
                    if (!identity) {
                      return null
                    }
                    return identity.verified
                  }
                : undefined,
            })
            return
          }
          logger.warn(
            {
              event: "monitoring.unknown_job",
              job_name: job.name,
              job_id: job.id,
            },
            "Ignoring unknown monitoring job"
          )
        }),
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: DNS_CHECK_WORKER_CONCURRENCY,
      }
    )
  )

  workers.push(
    new Worker(
      SYNC_QUEUE_NAME,
      (job) =>
        withJobLogs(SYNC_QUEUE_NAME, job, async () => {
          if (job.name === OPTIZMO_SYNC_JOB_NAME) {
            await handleOptizmoSyncJob(job.data as OptizmoSyncJobData, {
              db,
              env,
              syncQueue: activeSyncQueue,
            })
            return
          }
          if (job.name === AROHAA_TIER_SYNC_JOB_NAME) {
            await handleArohaaTierSyncJob(job.data as ArohaaTierSyncJobData, {
              db,
              enqueueSendEmail,
            })
            return
          }
          logger.warn(
            {
              event: "sync.unknown_job",
              job_name: job.name,
              job_id: job.id,
            },
            "Ignoring unknown sync job"
          )
        }),
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: OPTIZMO_SYNC_WORKER_CONCURRENCY,
      }
    )
  )

  workers.push(
    new Worker(
      INTAKE_QUEUE_NAME,
      (job) =>
        withJobLogs(INTAKE_QUEUE_NAME, job, async () => {
          if (job.name === CSV_INGEST_JOB_NAME) {
            await processCsvIngestJob(job.data as CsvIngestJobData, { db })
            return
          }
          logger.warn(
            {
              event: "intake.unknown_job",
              job_name: job.name,
              job_id: job.id,
            },
            "Ignoring unknown intake job"
          )
        }),
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: INTAKE_WORKER_CONCURRENCY,
      }
    )
  )

  workers.push(
    new Worker(
      DISPATCH_QUEUE_NAME,
      (job) =>
        withJobLogs(DISPATCH_QUEUE_NAME, job, async () => {
          if (job.name === SCHEDULE_PROMOTER_JOB_NAME) {
            await processSchedulePromoterJob({
              db,
              dispatchQueue: activeDispatchQueue,
            })
            return
          }
          if (job.name === DISPATCH_SEND_JOB_NAME) {
            await processDispatchSendJob(job.data as DispatchSendJobData, {
              db,
              enqueueSendEmail,
            })
            return
          }
          logger.warn(
            {
              event: "dispatch.unknown_job",
              job_name: job.name,
              job_id: job.id,
            },
            "Ignoring unknown dispatch job"
          )
        }),
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: DISPATCH_WORKER_CONCURRENCY,
      }
    )
  )

  workers.push(
    new Worker<EventsJobData>(
      EVENTS_QUEUE_NAME,
      (job) =>
        withJobLogs(EVENTS_QUEUE_NAME, job, async () => {
          await processEventsJob(job.data, { db })
        }),
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: 10,
      }
    )
  )

  workers.push(
    new Worker<SendEmailJobData>(
      SEND_EMAIL_QUEUE_NAME,
      (job) =>
        withJobLogs(SEND_EMAIL_QUEUE_NAME, job, async () => {
          await runSendEmailExclusive(db, job.data.message_id, async (tx) => {
            await processSendEmailJob(job.data, {
              load: (messageId) => loadQueuedSend(tx, messageId),
              skipIfSendChecksFail: (context) =>
                skipQueuedMessageIfBlocked(tx, context),
              markSent: (messageId, sesMessageId, sentAt) =>
                markMessageSent(tx, messageId, sesMessageId, sentAt),
              markFailed: (messageId, failureReason) =>
                markMessageFailed(tx, messageId, failureReason),
              claim: (messageId) => claimQueuedMessage(db, messageId),
              releaseClaim: (messageId) => releaseQueuedClaim(db, messageId),
              transport,
              compliance: {
                origin: await resolveUnsubscribeOrigin(db, env.BETTER_AUTH_URL),
                secret: env.UNSUBSCRIBE_TOKEN_SECRET,
              },
              pauseQueue: () => sendEmailQueue.pause(),
              openAccountPausedAlert: () => openSesAccountPausedAlert(tx),
            })
          })
        }),
      {
        connection,
        prefix: BULLMQ_PREFIX,
        concurrency: sendOptions.concurrency,
        ...(sendOptions.limiter ? { limiter: sendOptions.limiter } : {}),
      }
    )
  )

  for (const worker of workers) {
    attachWorkerFailureHandlers(worker, { db })
  }

  const limiterLabel = sendOptions.limiter
    ? `${String(sendOptions.limiter.max)}/s`
    : "off"
  logger.info(
    {
      event: "worker.ready",
      queues: QUEUE_NAMES,
      prefix: BULLMQ_PREFIX,
      send_email_concurrency: sendOptions.concurrency,
      send_email_limiter: limiterLabel,
      events_concurrency: 10,
      dispatch_concurrency: DISPATCH_WORKER_CONCURRENCY,
      intake_concurrency: INTAKE_WORKER_CONCURRENCY,
      sync_concurrency: OPTIZMO_SYNC_WORKER_CONCURRENCY,
      monitoring_concurrency: DNS_CHECK_WORKER_CONCURRENCY,
      maintenance_concurrency: MAINTENANCE_WORKER_CONCURRENCY,
    },
    "Worker ready"
  )

  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    logger.info(
      { event: "worker.shutting_down", signal },
      "Worker shutting down"
    )
    await Promise.all(workers.map((worker) => worker.close()))
    await Promise.all(managedQueues.map((queue) => queue.close()))
    await closeClickHouseClient().catch((err) => {
      logger.warn({ event: "worker.clickhouse_close_failed", err })
    })
    await connection.quit()
    await queueConnection.quit()
    process.exit(0)
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM")
  })
  process.on("SIGINT", () => {
    void shutdown("SIGINT")
  })
}

main().catch((error: unknown) => {
  logger.fatal(
    { event: "worker.boot_failed", err: error },
    "Worker failed to start"
  )
  process.exit(1)
})
