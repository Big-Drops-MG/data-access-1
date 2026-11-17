import type { AlertSeverity } from "./alerts.js"

/**
 * SES reputation metrics are gauges. Each CloudWatch point is already the
 * account's rolling bounce or complaint percentage, not a count. The latest
 * point in the 24 hour window is the current rate. Summing percentages
 * double-counts, and averaging them is not volume-weighted, so an older
 * healthy point would hide a current breach.
 *
 * CloudWatch's Percent unit is already a percentage: 2 means 2%, and 0.05
 * means 0.05%. Points with any other unit are ignored. If none remain, the
 * reading is invalid rather than zero.
 *
 * Recovery is not automatic. Alerts close only when a later check reads a
 * real value on the safe side of that alert's threshold. Missing points,
 * invalid units, and AWS errors leave the previous pause reasons in place.
 * Nothing in this module resumes the send-email queue.
 */

export const SES_HEALTH_JOB_NAME = "ses-health"
export const SES_HEALTH_INTERVAL_MS = 5 * 60 * 1000
export const SES_REPUTATION_WINDOW_MS = 24 * 60 * 60 * 1000
export const SES_REPUTATION_NAMESPACE = "AWS/SES"
export const SES_REPUTATION_PERIOD_SECONDS = 900
export const SES_REPUTATION_STATISTIC = "Average"
export const SES_REPUTATION_UNIT = "Percent"
export const SES_HEALTH_AWS_TIMEOUT_MS = 8_000
export const SES_HEALTH_LOCK_TTL_MS = 60_000
export const SES_HEALTH_LOCK_REDIS_KEY = "bd:ses-health:lock"
export const SES_SENDING_SAFETY_REDIS_KEY = "bd:ses-sending-safety"
export const SES_SEND_RATE_EPSILON = 1e-6

export const SES_BOUNCE_WARNING_PERCENT = 2
export const SES_BOUNCE_CRITICAL_PERCENT = 4
export const SES_COMPLAINT_WARNING_PERCENT = 0.05
export const SES_COMPLAINT_CRITICAL_PERCENT = 0.08

export const SES_REPUTATION_METRICS = [
  "Reputation.BounceRate",
  "Reputation.ComplaintRate",
] as const

export type SesReputationMetricName = (typeof SES_REPUTATION_METRICS)[number]

export const SES_PAUSE_REASONS = [
  "bounce_critical",
  "complaint_critical",
  "sending_disabled",
  "enforcement_restricted",
] as const

export type SesPauseReason = (typeof SES_PAUSE_REASONS)[number]

export type SesSendingSafety = {
  reasons: SesPauseReason[]
  updatedAt: string
}

export type SesAwsFailureKind =
  | "config"
  | "credentials"
  | "access_denied"
  | "throttled"
  | "network"
  | "timeout"
  | "unknown"

export type SesAccountSnapshot = {
  sendingEnabled: boolean | null
  enforcementStatus: string | null
  productionAccessEnabled: boolean | null
  max24HourSend: number | null
  sentLast24Hours: number | null
  maxSendRate: number | null
}

export type ReputationDatapoint = {
  timestampMs: number
  average: number | null
  unit?: string | null
}

export type ReputationReading =
  | { kind: "rate"; percent: number; samples: number; latestAt: string }
  | { kind: "missing" }
  | { kind: "invalid" }

export type MetricObservation =
  | { status: "ok"; reading: ReputationReading }
  | { status: "error"; failureKind: SesAwsFailureKind }

export type SesAlertIntent = {
  action: "open" | "close"
  type: string
  severity: AlertSeverity
  dedupeKey: string
  payload: Record<string, unknown> | null
}

export type SesHealthPlan = {
  replaceReasons: boolean
  reasons: SesPauseReason[]
  pause: boolean
  alerts: SesAlertIntent[]
}

type Active = "on" | "off" | "hold"

type AlertSpec = {
  type: string
  dedupeKey: string
  severity: AlertSeverity
}

export const SES_HEALTH_ALERTS = {
  bounceWarning: {
    type: "ses_bounce_rate_high",
    dedupeKey: "ses_health:bounce:warning",
    severity: "warning",
  },
  bounceCritical: {
    type: "ses_bounce_rate_critical",
    dedupeKey: "ses_health:bounce:critical",
    severity: "critical",
  },
  complaintWarning: {
    type: "ses_complaint_rate_high",
    dedupeKey: "ses_health:complaint:warning",
    severity: "warning",
  },
  complaintCritical: {
    type: "ses_complaint_rate_critical",
    dedupeKey: "ses_health:complaint:critical",
    severity: "critical",
  },
  sendingDisabled: {
    type: "ses_sending_disabled",
    dedupeKey: "ses_health:sending_disabled",
    severity: "critical",
  },
  enforcementRestricted: {
    type: "ses_enforcement_restricted",
    dedupeKey: "ses_health:enforcement:restricted",
    severity: "critical",
  },
  enforcementProbation: {
    type: "ses_enforcement_probation",
    dedupeKey: "ses_health:enforcement:probation",
    severity: "warning",
  },
  sendRateMismatch: {
    type: "ses_send_rate_mismatch",
    dedupeKey: "ses_health:send_rate_mismatch",
    severity: "warning",
  },
  healthCheckFailed: {
    type: "ses_health_check_failed",
    dedupeKey: "ses_health:check_failed",
    severity: "warning",
  },
  reputationUnavailable: {
    type: "ses_reputation_unavailable",
    dedupeKey: "ses_health:reputation_unavailable",
    severity: "warning",
  },
} as const satisfies Record<string, AlertSpec>

const BOUNCE_WARNING = SES_HEALTH_ALERTS.bounceWarning
const BOUNCE_CRITICAL = SES_HEALTH_ALERTS.bounceCritical
const COMPLAINT_WARNING = SES_HEALTH_ALERTS.complaintWarning
const COMPLAINT_CRITICAL = SES_HEALTH_ALERTS.complaintCritical

export function sesReputationWindow(now: Date): { start: Date; end: Date } {
  return {
    start: new Date(now.getTime() - SES_REPUTATION_WINDOW_MS),
    end: now,
  }
}

export function latestReputationPercent(
  datapoints: readonly ReputationDatapoint[]
): ReputationReading {
  const usable: { timestampMs: number; average: number }[] = []
  let sawInvalidUnit = false

  for (const point of datapoints) {
    if (
      !Number.isFinite(point.timestampMs) ||
      point.average === null ||
      !Number.isFinite(point.average)
    ) {
      continue
    }
    if (point.unit != null && point.unit !== SES_REPUTATION_UNIT) {
      sawInvalidUnit = true
      continue
    }
    usable.push({ timestampMs: point.timestampMs, average: point.average })
  }

  if (usable.length === 0) {
    return sawInvalidUnit ? { kind: "invalid" } : { kind: "missing" }
  }

  usable.sort((left, right) => right.timestampMs - left.timestampMs)
  const latest = usable[0]
  if (!latest) {
    return { kind: "missing" }
  }

  return {
    kind: "rate",
    percent: latest.average,
    samples: usable.length,
    latestAt: new Date(latest.timestampMs).toISOString(),
  }
}

export function sendRatesMatch(configured: number, actual: number): boolean {
  return Math.abs(configured - actual) <= SES_SEND_RATE_EPSILON
}

export function enforcementEffect(
  status: string | null
): "missing" | "healthy" | "probation" | "restricted" {
  if (status === null) {
    return "missing"
  }
  const normalized = status.trim().toUpperCase()
  if (normalized === "") {
    return "missing"
  }
  if (normalized === "HEALTHY") {
    return "healthy"
  }
  if (normalized === "PROBATION") {
    return "probation"
  }
  return "restricted"
}

export function isSesPauseReason(value: unknown): value is SesPauseReason {
  return (
    typeof value === "string" &&
    (SES_PAUSE_REASONS as readonly string[]).includes(value)
  )
}

export function sortSesPauseReasons(
  reasons: readonly SesPauseReason[]
): SesPauseReason[] {
  return SES_PAUSE_REASONS.filter((reason) => reasons.includes(reason))
}

export function serializeSesSendingSafety(state: SesSendingSafety): string {
  return JSON.stringify({
    reasons: sortSesPauseReasons(state.reasons),
    updatedAt: state.updatedAt,
  })
}

export function parseSesSendingSafety(
  raw: string
): SesSendingSafety | "invalid" {
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return "invalid"
    }
    const record = value as { reasons?: unknown; updatedAt?: unknown }
    if (!Array.isArray(record.reasons)) {
      return "invalid"
    }
    const reasons: SesPauseReason[] = []
    for (const entry of record.reasons) {
      if (!isSesPauseReason(entry)) {
        return "invalid"
      }
      reasons.push(entry)
    }
    return {
      reasons: sortSesPauseReasons(reasons),
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    }
  } catch {
    return "invalid"
  }
}

export async function readSesSendingSafety(redis: {
  get(key: string): Promise<string | null>
}): Promise<SesSendingSafety | "invalid" | null> {
  const raw = await redis.get(SES_SENDING_SAFETY_REDIS_KEY)
  if (raw === null || raw === "") {
    return null
  }
  return parseSesSendingSafety(raw)
}

export async function isSesSendingBlocked(redis: {
  get(key: string): Promise<string | null>
}): Promise<boolean> {
  try {
    const state = await readSesSendingSafety(redis)
    if (state === null) {
      return false
    }
    if (state === "invalid") {
      return true
    }
    return state.reasons.length > 0
  } catch {
    return true
  }
}

export function planSesHealthFailure(input: {
  failureKind: SesAwsFailureKind
  source: "config" | "ses" | "cloudwatch"
  previousReasons: readonly SesPauseReason[]
}): SesHealthPlan {
  const reasons = sortSesPauseReasons(input.previousReasons)
  return {
    replaceReasons: false,
    reasons,
    pause: reasons.length > 0,
    alerts: [
      openAlert(SES_HEALTH_ALERTS.healthCheckFailed, {
        reason: "aws_error",
        source: input.source,
        failureKind: input.failureKind,
      }),
    ],
  }
}

export function evaluateSesHealth(input: {
  account: SesAccountSnapshot
  bounce: MetricObservation
  complaint: MetricObservation
  configuredSendRate: number | null
  previousReasons: readonly SesPauseReason[]
  now: Date
}): SesHealthPlan {
  const checkedAt = input.now.toISOString()
  const alerts: SesAlertIntent[] = []
  let reasons = sortSesPauseReasons(input.previousReasons)

  reasons = applyActive(
    reasons,
    "bounce_critical",
    metricActive(input.bounce, SES_BOUNCE_CRITICAL_PERCENT)
  )
  reasons = applyActive(
    reasons,
    "complaint_critical",
    metricActive(input.complaint, SES_COMPLAINT_CRITICAL_PERCENT)
  )
  reasons = applyActive(
    reasons,
    "sending_disabled",
    input.account.sendingEnabled === false
      ? "on"
      : input.account.sendingEnabled === true
        ? "off"
        : "hold"
  )

  const enforcement = enforcementEffect(input.account.enforcementStatus)
  reasons = applyActive(
    reasons,
    "enforcement_restricted",
    enforcement === "restricted"
      ? "on"
      : enforcement === "missing"
        ? "hold"
        : "off"
  )

  pushRateAlerts(
    alerts,
    input.bounce,
    {
      warning: BOUNCE_WARNING,
      warningThreshold: SES_BOUNCE_WARNING_PERCENT,
      critical: BOUNCE_CRITICAL,
      criticalThreshold: SES_BOUNCE_CRITICAL_PERCENT,
    },
    checkedAt
  )
  pushRateAlerts(
    alerts,
    input.complaint,
    {
      warning: COMPLAINT_WARNING,
      warningThreshold: SES_COMPLAINT_WARNING_PERCENT,
      critical: COMPLAINT_CRITICAL,
      criticalThreshold: SES_COMPLAINT_CRITICAL_PERCENT,
    },
    checkedAt
  )
  pushAccountAlerts(alerts, input.account, enforcement, checkedAt)
  pushReputationAvailability(alerts, input.bounce, input.complaint, checkedAt)
  pushSendRateAlert(
    alerts,
    input.configuredSendRate,
    input.account.maxSendRate,
    checkedAt
  )
  pushHealthCheckAlert(alerts, input, checkedAt)

  const nextReasons = sortSesPauseReasons(reasons)
  return {
    replaceReasons: true,
    reasons: nextReasons,
    pause: nextReasons.length > 0,
    alerts,
  }
}

export function classifyAwsFailure(error: unknown): SesAwsFailureKind {
  const name = errorName(error)
  const message = error instanceof Error ? error.message : ""
  const status = httpStatus(error)
  const haystack = `${name} ${message}`

  if (
    name === "CredentialsProviderError" ||
    /could not load credentials|missing credentials/i.test(message)
  ) {
    return "credentials"
  }
  if (
    status === 401 ||
    status === 403 ||
    name === "AccessDeniedException" ||
    name === "UnauthorizedException" ||
    name === "AccessDenied"
  ) {
    return "access_denied"
  }
  if (
    status === 429 ||
    /Throttl|TooManyRequests|LimitExceeded|SlowDown/.test(name)
  ) {
    return "throttled"
  }
  if (
    name === "TimeoutError" ||
    name === "AbortError" ||
    /timeout|aborted/i.test(message)
  ) {
    return "timeout"
  }
  if (
    /NetworkingError|ECONN|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|socket/i.test(
      haystack
    )
  ) {
    return "network"
  }
  return "unknown"
}

export function publicAwsFailureName(error: unknown): string {
  return errorName(error)
}

function pushRateAlerts(
  alerts: SesAlertIntent[],
  metric: MetricObservation,
  spec: {
    warning: AlertSpec
    warningThreshold: number
    critical: AlertSpec
    criticalThreshold: number
  },
  checkedAt: string
): void {
  if (metric.status !== "ok" || metric.reading.kind !== "rate") {
    return
  }
  const percent = metric.reading.percent
  if (!Number.isFinite(percent)) {
    return
  }
  const payload = {
    ratePercent: percent,
    unit: "percent",
    windowHours: SES_REPUTATION_WINDOW_MS / (60 * 60 * 1000),
    samples: metric.reading.samples,
    latestAt: metric.reading.latestAt,
    checkedAt,
  }
  if (percent >= spec.criticalThreshold) {
    alerts.push(
      openAlert(spec.critical, {
        ...payload,
        thresholdPercent: spec.criticalThreshold,
      })
    )
    alerts.push(
      openAlert(spec.warning, {
        ...payload,
        thresholdPercent: spec.warningThreshold,
      })
    )
    return
  }
  alerts.push(closeAlert(spec.critical))
  if (percent >= spec.warningThreshold) {
    alerts.push(
      openAlert(spec.warning, {
        ...payload,
        thresholdPercent: spec.warningThreshold,
      })
    )
    return
  }
  alerts.push(closeAlert(spec.warning))
}

function pushAccountAlerts(
  alerts: SesAlertIntent[],
  account: SesAccountSnapshot,
  enforcement: ReturnType<typeof enforcementEffect>,
  checkedAt: string
): void {
  if (account.sendingEnabled === false) {
    alerts.push(
      openAlert(SES_HEALTH_ALERTS.sendingDisabled, {
        sendingEnabled: false,
        enforcementStatus: account.enforcementStatus,
        checkedAt,
      })
    )
  } else if (account.sendingEnabled === true) {
    alerts.push(closeAlert(SES_HEALTH_ALERTS.sendingDisabled))
  }

  if (enforcement === "restricted") {
    alerts.push(
      openAlert(SES_HEALTH_ALERTS.enforcementRestricted, {
        enforcementStatus: account.enforcementStatus,
        sendingAllowed: false,
        checkedAt,
      })
    )
    alerts.push(closeAlert(SES_HEALTH_ALERTS.enforcementProbation))
    return
  }
  if (enforcement === "probation") {
    alerts.push(
      openAlert(SES_HEALTH_ALERTS.enforcementProbation, {
        enforcementStatus: account.enforcementStatus,
        sendingAllowed: true,
        checkedAt,
      })
    )
    alerts.push(closeAlert(SES_HEALTH_ALERTS.enforcementRestricted))
    return
  }
  if (enforcement === "healthy") {
    alerts.push(closeAlert(SES_HEALTH_ALERTS.enforcementRestricted))
    alerts.push(closeAlert(SES_HEALTH_ALERTS.enforcementProbation))
  }
}

function pushReputationAvailability(
  alerts: SesAlertIntent[],
  bounce: MetricObservation,
  complaint: MetricObservation,
  checkedAt: string
): void {
  if (bounce.status === "error" || complaint.status === "error") {
    return
  }
  const bounceState = readingState(bounce.reading)
  const complaintState = readingState(complaint.reading)
  if (bounceState === "rate" && complaintState === "rate") {
    alerts.push(closeAlert(SES_HEALTH_ALERTS.reputationUnavailable))
    return
  }
  alerts.push(
    openAlert(SES_HEALTH_ALERTS.reputationUnavailable, {
      bounce: bounceState,
      complaint: complaintState,
      checkedAt,
    })
  )
}

function pushSendRateAlert(
  alerts: SesAlertIntent[],
  configuredSendRate: number | null,
  actualSendRate: number | null,
  checkedAt: string
): void {
  if (
    configuredSendRate === null ||
    actualSendRate === null ||
    !Number.isFinite(configuredSendRate) ||
    !Number.isFinite(actualSendRate)
  ) {
    return
  }
  if (sendRatesMatch(configuredSendRate, actualSendRate)) {
    alerts.push(closeAlert(SES_HEALTH_ALERTS.sendRateMismatch))
    return
  }
  alerts.push(
    openAlert(SES_HEALTH_ALERTS.sendRateMismatch, {
      configuredSendRate,
      actualSendRate,
      unit: "sends_per_second",
      tolerance: SES_SEND_RATE_EPSILON,
      checkedAt,
    })
  )
}

function pushHealthCheckAlert(
  alerts: SesAlertIntent[],
  input: {
    account: SesAccountSnapshot
    bounce: MetricObservation
    complaint: MetricObservation
  },
  checkedAt: string
): void {
  const missing = missingAccountFields(input.account)
  const metrics: { metric: string; failureKind: SesAwsFailureKind }[] = []
  if (input.bounce.status === "error") {
    metrics.push({
      metric: "Reputation.BounceRate",
      failureKind: input.bounce.failureKind,
    })
  }
  if (input.complaint.status === "error") {
    metrics.push({
      metric: "Reputation.ComplaintRate",
      failureKind: input.complaint.failureKind,
    })
  }
  if (missing.length === 0 && metrics.length === 0) {
    alerts.push(closeAlert(SES_HEALTH_ALERTS.healthCheckFailed))
    return
  }
  alerts.push(
    openAlert(SES_HEALTH_ALERTS.healthCheckFailed, {
      reason: metrics.length > 0 ? "aws_error" : "incomplete_account",
      missing,
      metrics,
      checkedAt,
    })
  )
}

function missingAccountFields(account: SesAccountSnapshot): string[] {
  const missing: string[] = []
  if (account.sendingEnabled === null) {
    missing.push("sendingEnabled")
  }
  if (account.enforcementStatus === null) {
    missing.push("enforcementStatus")
  }
  if (account.max24HourSend === null) {
    missing.push("max24HourSend")
  }
  if (account.sentLast24Hours === null) {
    missing.push("sentLast24Hours")
  }
  if (account.maxSendRate === null) {
    missing.push("maxSendRate")
  }
  return missing
}

function readingState(reading: ReputationReading): ReputationReading["kind"] {
  return reading.kind
}

function metricActive(metric: MetricObservation, critical: number): Active {
  if (metric.status !== "ok" || metric.reading.kind !== "rate") {
    return "hold"
  }
  if (!Number.isFinite(metric.reading.percent)) {
    return "hold"
  }
  return metric.reading.percent >= critical ? "on" : "off"
}

function applyActive(
  reasons: SesPauseReason[],
  reason: SesPauseReason,
  active: Active
): SesPauseReason[] {
  if (active === "hold") {
    return reasons
  }
  if (active === "on") {
    return sortSesPauseReasons([...reasons, reason])
  }
  return reasons.filter((entry) => entry !== reason)
}

function openAlert(
  spec: AlertSpec,
  payload: Record<string, unknown>
): SesAlertIntent {
  return {
    action: "open",
    type: spec.type,
    severity: spec.severity,
    dedupeKey: spec.dedupeKey,
    payload,
  }
}

function closeAlert(spec: AlertSpec): SesAlertIntent {
  return {
    action: "close",
    type: spec.type,
    severity: spec.severity,
    dedupeKey: spec.dedupeKey,
    payload: null,
  }
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name.trim() !== ""
    ? error.name
    : "Error"
}

function httpStatus(error: unknown): number | undefined {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)
    if ("$metadata" in current) {
      const metadata = current.$metadata
      if (
        typeof metadata === "object" &&
        metadata !== null &&
        "httpStatusCode" in metadata &&
        typeof metadata.httpStatusCode === "number"
      ) {
        return metadata.httpStatusCode
      }
    }
    current = "cause" in current ? current.cause : undefined
  }
  return undefined
}
