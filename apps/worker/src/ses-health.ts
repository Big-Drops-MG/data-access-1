import { randomUUID } from "node:crypto"

import { GetAccountCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch"
import type { Database } from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import {
  SES_HEALTH_ALERTS,
  SES_HEALTH_AWS_TIMEOUT_MS,
  SES_HEALTH_LOCK_REDIS_KEY,
  SES_HEALTH_LOCK_TTL_MS,
  SES_REPUTATION_NAMESPACE,
  SES_REPUTATION_PERIOD_SECONDS,
  SES_REPUTATION_STATISTIC,
  SES_REPUTATION_UNIT,
  SES_SENDING_SAFETY_REDIS_KEY,
  classifyAwsFailure,
  closeAlert,
  evaluateSesHealth,
  isSesSendingBlocked,
  latestReputationPercent,
  openAlert,
  planSesHealthFailure,
  publicAwsFailureName,
  readSesSendingSafety,
  serializeSesSendingSafety,
  sesReputationWindow,
  sesSendRatePerSecond,
  sortSesPauseReasons,
  type MetricObservation,
  type ReputationDatapoint,
  type SesAccountSnapshot,
  type SesHealthPlan,
  type SesPauseReason,
  type SesReputationMetricName,
} from "@workspace/shared"

export type SesHealthRedis = {
  get(key: string): Promise<string | null>
  set(
    key: string,
    value: string,
    expiryMode?: "PX",
    ttlMs?: number,
    mode?: "NX"
  ): Promise<string | null>
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>
}

export type SesHealthClients = {
  getAccount: (signal: AbortSignal) => Promise<SesAccountSnapshot>
  getMetric: (
    metricName: SesReputationMetricName,
    window: { start: Date; end: Date },
    signal: AbortSignal
  ) => Promise<ReputationDatapoint[]>
}

export type SesHealthJobDeps = {
  env: {
    MAIL_TRANSPORT: "smtp" | "ses"
    SES_REGION?: string
    SES_MAX_SEND_RATE?: string
  }
  db: Database
  redis: SesHealthRedis
  pauseSendEmail: () => Promise<void>
  now?: Date
  clients?: SesHealthClients
}

export type SesHealthJobResult = {
  outcome: "skipped" | "overlapped" | "checked"
  reasons: SesPauseReason[] | null
  paused: boolean
}

const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

const THRESHOLD_ALERT_TYPES = new Set<string>([
  SES_HEALTH_ALERTS.bounceWarning.type,
  SES_HEALTH_ALERTS.bounceCritical.type,
  SES_HEALTH_ALERTS.complaintWarning.type,
  SES_HEALTH_ALERTS.complaintCritical.type,
])

export async function enforcePersistedSesSendingPause(
  redis: SesHealthRedis,
  pauseSendEmail: () => Promise<void>
): Promise<boolean> {
  const blocked = await isSesSendingBlocked(redis)
  if (!blocked) {
    return false
  }
  await pauseSendEmail()
  return true
}

type SesGetAccountResult = {
  SendingEnabled?: boolean
  EnforcementStatus?: string
  ProductionAccessEnabled?: boolean
  SendQuota?: {
    Max24HourSend?: number
    SentLast24Hours?: number
    MaxSendRate?: number
  }
}

type SesMetricDatapoint = {
  Timestamp?: Date
  Average?: number
  Unit?: string
}

export async function readSesAccount(
  send: (
    command: GetAccountCommand,
    signal: AbortSignal
  ) => Promise<SesGetAccountResult>,
  signal: AbortSignal
): Promise<SesAccountSnapshot> {
  const output = await send(new GetAccountCommand({}), signal)
  return mapAccount(output)
}

export async function readReputationMetric(
  send: (
    command: GetMetricStatisticsCommand,
    signal: AbortSignal
  ) => Promise<{ Datapoints?: SesMetricDatapoint[] }>,
  metricName: SesReputationMetricName,
  window: { start: Date; end: Date },
  signal: AbortSignal
): Promise<ReputationDatapoint[]> {
  const output = await send(
    new GetMetricStatisticsCommand({
      Namespace: SES_REPUTATION_NAMESPACE,
      MetricName: metricName,
      StartTime: window.start,
      EndTime: window.end,
      Period: SES_REPUTATION_PERIOD_SECONDS,
      Statistics: [SES_REPUTATION_STATISTIC],
      Unit: SES_REPUTATION_UNIT,
    }),
    signal
  )
  return mapDatapoints(output.Datapoints)
}

export function createSesHealthClients(region: string): SesHealthClients & {
  close: () => void
} {
  const ses = new SESv2Client({ region, maxAttempts: 1 })
  const cloudWatch = new CloudWatchClient({ region, maxAttempts: 1 })
  return {
    getAccount: (signal) =>
      readSesAccount(
        (command, abortSignal) => ses.send(command, { abortSignal }),
        signal
      ),
    getMetric: (metricName, window, signal) =>
      readReputationMetric(
        (command, abortSignal) => cloudWatch.send(command, { abortSignal }),
        metricName,
        window,
        signal
      ),
    close: () => {
      ses.destroy()
      cloudWatch.destroy()
    },
  }
}

export async function processSesHealthJob(
  deps: SesHealthJobDeps
): Promise<SesHealthJobResult> {
  const logger = getContextLogger()
  if (deps.env.MAIL_TRANSPORT !== "ses") {
    logger.info(
      { event: "ses_health.skipped", reason: "mail_transport" },
      "SES health check skipped"
    )
    return { outcome: "skipped", reasons: null, paused: false }
  }

  const token = await acquireLock(deps.redis)
  if (!token) {
    logger.info(
      { event: "ses_health.skipped_overlap" },
      "SES health check already running"
    )
    return { outcome: "overlapped", reasons: null, paused: false }
  }

  const ownedClients = deps.clients ? undefined : openClients(deps.env)
  try {
    logger.info({ event: "ses_health.started" }, "SES health check started")
    const now = deps.now ?? new Date()
    const stored = await readSesSendingSafety(deps.redis)
    const previous =
      stored === null || stored === "invalid" ? [] : stored.reasons
    const safetyUnreadable = stored === "invalid"
    const clients = deps.clients ?? ownedClients?.clients
    if (!clients) {
      getContextLogger().error(
        {
          event: "ses_health.aws_failed",
          source: "config",
          failure_kind: "config",
          error_name: "Error",
        },
        "SES health AWS request failed"
      )
      const plan = planSesHealthFailure({
        failureKind: "config",
        source: "config",
        previousReasons: previous,
      })
      return await applyPlan(deps, plan, previous, now, null, safetyUnreadable)
    }

    let account: SesAccountSnapshot
    try {
      account = await withCallSignal((signal) => clients.getAccount(signal))
    } catch (error) {
      logAwsFailure(error, "ses")
      const plan = planSesHealthFailure({
        failureKind: classifyAwsFailure(error),
        source: "ses",
        previousReasons: previous,
      })
      return await applyPlan(deps, plan, previous, now, null, safetyUnreadable)
    }

    const window = sesReputationWindow(now)
    const [bounce, complaint] = await Promise.all([
      observeMetric(clients, "Reputation.BounceRate", window),
      observeMetric(clients, "Reputation.ComplaintRate", window),
    ])
    const plan = evaluateSesHealth({
      account,
      bounce,
      complaint,
      configuredSendRate: configuredSendRate(deps.env),
      previousReasons: previous,
      now,
    })
    return await applyPlan(deps, plan, previous, now, account, safetyUnreadable)
  } finally {
    ownedClients?.close()
    await releaseLock(deps.redis, token)
  }
}

async function applyPlan(
  deps: SesHealthJobDeps,
  plan: SesHealthPlan,
  previous: readonly SesPauseReason[],
  now: Date,
  account: SesAccountSnapshot | null,
  safetyUnreadable: boolean
): Promise<SesHealthJobResult> {
  const logger = getContextLogger()
  const reasons = sortSesPauseReasons(plan.reasons)
  const pause = plan.pause || safetyUnreadable
  if (pause) {
    await deps.pauseSendEmail()
    logger.warn(
      {
        event: "ses_health.sending_paused",
        reasons,
        reaffirmed: sameReasons(previous, reasons),
      },
      "SES safety pause applied"
    )
  }
  if (plan.replaceReasons) {
    await deps.redis.set(
      SES_SENDING_SAFETY_REDIS_KEY,
      serializeSesSendingSafety({
        reasons,
        updatedAt: now.toISOString(),
      })
    )
  }

  let recovered = false
  let thresholdOpened = false
  let mismatchOpened = false
  for (const intent of plan.alerts) {
    if (intent.action === "open") {
      const opened = await openAlert(deps.db, {
        type: intent.type,
        severity: intent.severity,
        dedupeKey: intent.dedupeKey,
        payload: intent.payload,
        now,
        refreshPayload: true,
      })
      if (opened.created && THRESHOLD_ALERT_TYPES.has(intent.type)) {
        thresholdOpened = true
      }
      if (
        opened.created &&
        intent.type === SES_HEALTH_ALERTS.sendRateMismatch.type
      ) {
        mismatchOpened = true
      }
      continue
    }
    const closed = await closeAlert(deps.db, {
      type: intent.type,
      dedupeKey: intent.dedupeKey,
      now,
    })
    if (closed.closed) {
      recovered = true
    }
  }

  if (thresholdOpened) {
    logger.warn(
      { event: "ses_health.threshold_exceeded", reasons },
      "SES reputation threshold exceeded"
    )
  }
  if (mismatchOpened) {
    logger.warn(
      { event: "ses_health.rate_mismatch" },
      "SES_MAX_SEND_RATE does not match the SES account rate"
    )
  }
  if (recovered) {
    logger.info(
      { event: "ses_health.recovered", reasons },
      "SES health alert recovered"
    )
  }
  logger.info(
    {
      event: "ses_health.completed",
      reasons,
      paused: pause,
      sending_enabled: account?.sendingEnabled ?? null,
      enforcement_status: account?.enforcementStatus ?? null,
      production_access_enabled: account?.productionAccessEnabled ?? null,
      max_24_hour_send: account?.max24HourSend ?? null,
      sent_last_24_hours: account?.sentLast24Hours ?? null,
      max_send_rate: account?.maxSendRate ?? null,
    },
    "SES health check completed"
  )

  return { outcome: "checked", reasons, paused: pause }
}

async function observeMetric(
  clients: SesHealthClients,
  metricName: SesReputationMetricName,
  window: { start: Date; end: Date }
): Promise<MetricObservation> {
  try {
    const points = await withCallSignal((signal) =>
      clients.getMetric(metricName, window, signal)
    )
    return { status: "ok", reading: latestReputationPercent(points) }
  } catch (error) {
    logAwsFailure(error, "cloudwatch")
    return { status: "error", failureKind: classifyAwsFailure(error) }
  }
}

function openClients(env: SesHealthJobDeps["env"]): {
  clients: SesHealthClients
  close: () => void
} | null {
  const region = env.SES_REGION?.trim() ?? ""
  if (region === "") {
    return null
  }
  const clients = createSesHealthClients(region)
  return { clients, close: () => clients.close() }
}

function configuredSendRate(env: SesHealthJobDeps["env"]): number | null {
  try {
    return sesSendRatePerSecond(env) ?? null
  } catch {
    return null
  }
}

async function acquireLock(redis: SesHealthRedis): Promise<string | null> {
  const token = randomUUID()
  const acquired = await redis.set(
    SES_HEALTH_LOCK_REDIS_KEY,
    token,
    "PX",
    SES_HEALTH_LOCK_TTL_MS,
    "NX"
  )
  return acquired === "OK" ? token : null
}

async function releaseLock(
  redis: SesHealthRedis,
  token: string
): Promise<void> {
  await redis.eval(RELEASE_LOCK_SCRIPT, 1, SES_HEALTH_LOCK_REDIS_KEY, token)
}

async function withCallSignal<T>(
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, SES_HEALTH_AWS_TIMEOUT_MS)
  timer.unref?.()
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

function logAwsFailure(error: unknown, source: "ses" | "cloudwatch"): void {
  getContextLogger().error(
    {
      event: "ses_health.aws_failed",
      source,
      failure_kind: classifyAwsFailure(error),
      error_name: publicAwsFailureName(error),
    },
    "SES health AWS request failed"
  )
}

function sameReasons(
  left: readonly SesPauseReason[],
  right: readonly SesPauseReason[]
): boolean {
  const previous = sortSesPauseReasons(left)
  const next = sortSesPauseReasons(right)
  return (
    previous.length === next.length &&
    previous.every((reason, index) => reason === next[index])
  )
}

function mapAccount(output: SesGetAccountResult): SesAccountSnapshot {
  return {
    sendingEnabled:
      typeof output.SendingEnabled === "boolean" ? output.SendingEnabled : null,
    enforcementStatus: cleanText(output.EnforcementStatus),
    productionAccessEnabled:
      typeof output.ProductionAccessEnabled === "boolean"
        ? output.ProductionAccessEnabled
        : null,
    max24HourSend: finiteOrNull(output.SendQuota?.Max24HourSend),
    sentLast24Hours: finiteOrNull(output.SendQuota?.SentLast24Hours),
    maxSendRate: finiteOrNull(output.SendQuota?.MaxSendRate),
  }
}

function mapDatapoints(
  points: readonly SesMetricDatapoint[] | undefined
): ReputationDatapoint[] {
  const mapped: ReputationDatapoint[] = []
  for (const point of points ?? []) {
    const timestampMs = point.Timestamp?.getTime()
    mapped.push({
      timestampMs: typeof timestampMs === "number" ? timestampMs : Number.NaN,
      average: typeof point.Average === "number" ? point.Average : null,
      unit: point.Unit ?? null,
    })
  }
  return mapped
}

function cleanText(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
