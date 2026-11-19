import { alert } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { getContextLogger, serializeError } from "@workspace/logger"
import { openAlert, type OpenAlertResult } from "@workspace/shared"
import type { Job, Worker } from "bullmq"
import { UnrecoverableError } from "bullmq"
import { and, desc, eq } from "drizzle-orm"

export { UnrecoverableError }

export const QUEUE_JOB_FAILED_ALERT_TYPE = "queue_job_failed"
export const QUEUE_JOB_FAILED_WINDOW_MS = 60 * 60_000

export type CaptureWorkerException = (
  error: unknown,
  context: {
    queue: string
    jobName: string
    jobId?: string
    requestId?: string
  }
) => void | Promise<void>

export type JobFailureDeps = {
  db: Database
  now?: () => Date
  openAlertFn?: typeof openAlert
  captureException?: CaptureWorkerException
}

export function isUnrecoverableError(error: unknown): boolean {
  if (error instanceof UnrecoverableError) {
    return true
  }
  return error instanceof Error && error.name === "UnrecoverableError"
}

export function isFinalJobFailure(
  job: Pick<Job, "attemptsMade" | "opts">,
  error: unknown
): boolean {
  if (isUnrecoverableError(error)) {
    return true
  }
  const maxAttempts = job.opts.attempts ?? 1
  return job.attemptsMade >= maxAttempts
}

export function queueJobFailedDedupeKey(
  queueName: string,
  jobName: string
): string {
  return `queue_job:${queueName}:${jobName}`
}

export async function openQueueJobFailedAlert(
  deps: JobFailureDeps,
  input: {
    queueName: string
    jobName: string
    jobId?: string
    error: unknown
    requestId?: string
  }
): Promise<OpenAlertResult | { skipped: true; reason: "hourly_limit" }> {
  const now = deps.now?.() ?? new Date()
  const dedupeKey = queueJobFailedDedupeKey(input.queueName, input.jobName)
  const open = deps.openAlertFn ?? openAlert

  const [latest] = await deps.db
    .select()
    .from(alert)
    .where(
      and(
        eq(alert.type, QUEUE_JOB_FAILED_ALERT_TYPE),
        eq(alert.dedupeKey, dedupeKey)
      )
    )
    .orderBy(desc(alert.id))
    .limit(1)

  if (latest && latest.status !== "open") {
    const elapsed = now.getTime() - latest.openedAt.getTime()
    if (elapsed < QUEUE_JOB_FAILED_WINDOW_MS) {
      return { skipped: true, reason: "hourly_limit" }
    }
  }

  const serialized = serializeError(input.error)
  return open(deps.db, {
    type: QUEUE_JOB_FAILED_ALERT_TYPE,
    severity: "warning",
    dedupeKey,
    payload: {
      queue: input.queueName,
      job_name: input.jobName,
      ...(input.jobId ? { job_id: input.jobId } : {}),
      ...(input.requestId ? { request_id: input.requestId } : {}),
      error_type: serialized.type,
      error_message: serialized.message,
    },
    now,
    refreshPayload: true,
  })
}

export async function handleFinalJobFailure(
  deps: JobFailureDeps,
  input: {
    queueName: string
    job: Job
    error: unknown
  }
): Promise<void> {
  const logger = getContextLogger()
  const requestId =
    typeof input.job.data === "object" &&
    input.job.data !== null &&
    "request_id" in input.job.data &&
    typeof (input.job.data as { request_id?: unknown }).request_id === "string"
      ? (input.job.data as { request_id: string }).request_id
      : undefined

  logger.warn(
    {
      event: "job.failed",
      queue: input.queueName,
      job_name: input.job.name,
      job_id: input.job.id,
      attempt: input.job.attemptsMade,
      ...(requestId ? { request_id: requestId } : {}),
      err: input.error,
    },
    "Job failed"
  )

  const capture = deps.captureException ?? defaultCaptureWorkerException
  await capture(input.error, {
    queue: input.queueName,
    jobName: input.job.name,
    ...(input.job.id ? { jobId: input.job.id } : {}),
    ...(requestId ? { requestId } : {}),
  })

  try {
    await openQueueJobFailedAlert(deps, {
      queueName: input.queueName,
      jobName: input.job.name,
      ...(input.job.id ? { jobId: input.job.id } : {}),
      error: input.error,
      ...(requestId ? { requestId } : {}),
    })
  } catch (alertError) {
    logger.error(
      {
        event: "queue_job_failed.alert_error",
        queue: input.queueName,
        job_name: input.job.name,
        err: alertError,
      },
      "Failed to open queue_job_failed alert"
    )
  }
}

export function defaultCaptureWorkerException(
  error: unknown,
  context: {
    queue: string
    jobName: string
    jobId?: string
    requestId?: string
  }
): void {
  getContextLogger().error(
    {
      event: "sentry.capture",
      queue: context.queue,
      job_name: context.jobName,
      ...(context.jobId ? { job_id: context.jobId } : {}),
      ...(context.requestId ? { request_id: context.requestId } : {}),
      err: error,
    },
    "Worker failure captured for Sentry"
  )
}

export function attachWorkerFailureHandlers(
  worker: Worker,
  deps: JobFailureDeps
): void {
  const queueName = worker.name
  worker.on("failed", (job, error) => {
    if (!job) {
      return
    }
    if (!isFinalJobFailure(job, error)) {
      return
    }
    void handleFinalJobFailure(deps, { queueName, job, error })
  })
  worker.on("stalled", (jobId) => {
    getContextLogger().warn(
      {
        event: "job.stalled",
        queue: queueName,
        job_id: jobId,
      },
      "Job stalled"
    )
  })
}

export function attachProcessFailureHandlers(
  captureException: CaptureWorkerException = defaultCaptureWorkerException
): void {
  const onFatal = (event: string, error: unknown): void => {
    const logger = getContextLogger()
    logger.fatal({ event, err: error }, "Process fatal error")
    void Promise.resolve(
      captureException(error, {
        queue: "process",
        jobName: event,
      })
    ).finally(() => {
      process.exit(1)
    })
  }

  process.on("unhandledRejection", (reason) => {
    onFatal("process.unhandled_rejection", reason)
  })
  process.on("uncaughtException", (error) => {
    onFatal("process.uncaught_exception", error)
  })
}
