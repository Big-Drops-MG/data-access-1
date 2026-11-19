import type { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch"
import { GetAccountCommand } from "@aws-sdk/client-sesv2"
import {
  SES_HEALTH_ALERTS,
  SES_SENDING_SAFETY_REDIS_KEY,
  serializeSesSendingSafety,
  sesReputationWindow,
} from "@workspace/shared"
import { beforeEach, describe, expect, it, vi } from "vitest"

const openAlert = vi.hoisted(() => vi.fn())
const closeAlert = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, openAlert, closeAlert }
})

import {
  enforcePersistedSesSendingPause,
  processSesHealthJob,
  readReputationMetric,
  readSesAccount,
  type SesHealthClients,
  type SesHealthRedis,
} from "./ses-health.js"

const NOW = new Date("2026-11-18T12:00:00.000Z")

type AccountResult = {
  SendingEnabled?: boolean
  EnforcementStatus?: string
  ProductionAccessEnabled?: boolean
  SendQuota?: {
    Max24HourSend?: number
    SentLast24Hours?: number
    MaxSendRate?: number
  }
}

type MetricResult = {
  Datapoints?: Array<{ Timestamp?: Date; Average?: number; Unit?: string }>
}

function memoryRedis(): SesHealthRedis & {
  snapshot: () => string | null
} {
  const values = new Map<string, { value: string; expiresAt: number | null }>()
  return {
    snapshot: () => values.get(SES_SENDING_SAFETY_REDIS_KEY)?.value ?? null,
    async get(key) {
      const row = values.get(key)
      if (!row) {
        return null
      }
      if (row.expiresAt !== null && row.expiresAt <= Date.now()) {
        values.delete(key)
        return null
      }
      return row.value
    },
    async set(key, value, expiryMode, ttlMs, mode) {
      const existing = values.get(key)
      const live =
        existing !== undefined &&
        (existing.expiresAt === null || existing.expiresAt > Date.now())
      if (mode === "NX" && live) {
        return null
      }
      values.set(key, {
        value,
        expiresAt:
          expiryMode === "PX" && ttlMs !== undefined
            ? Date.now() + ttlMs
            : null,
      })
      return "OK"
    },
    async eval(_script, _numKeys, ...args) {
      const key = args[0]
      const token = args[1]
      if (!key || !token) {
        return 0
      }
      const row = values.get(key)
      if (row && row.value === token) {
        values.delete(key)
        return 1
      }
      return 0
    },
  }
}

function healthyAccount(): AccountResult {
  return {
    SendingEnabled: true,
    EnforcementStatus: "HEALTHY",
    ProductionAccessEnabled: true,
    SendQuota: {
      Max24HourSend: 50_000,
      SentLast24Hours: 12,
      MaxSendRate: 14,
    },
  }
}

function points(
  percent: number,
  at = new Date("2026-11-18T11:45:00.000Z")
): MetricResult {
  return { Datapoints: [{ Timestamp: at, Average: percent, Unit: "Percent" }] }
}

function clients(input: {
  account?: AccountResult | (() => Promise<AccountResult>)
  bounce?: MetricResult | (() => Promise<MetricResult>)
  complaint?: MetricResult | (() => Promise<MetricResult>)
  onAccount?: (command: GetAccountCommand) => void
  onMetric?: (command: GetMetricStatisticsCommand) => void
}): SesHealthClients {
  return {
    getAccount: (signal) =>
      readSesAccount(async (command) => {
        input.onAccount?.(command)
        if (typeof input.account === "function") {
          return input.account()
        }
        return input.account ?? healthyAccount()
      }, signal),
    getMetric: (metricName, window, signal) =>
      readReputationMetric(
        async (command) => {
          input.onMetric?.(command)
          const source =
            metricName === "Reputation.BounceRate"
              ? input.bounce
              : input.complaint
          if (typeof source === "function") {
            return source()
          }
          return (
            source ??
            points(metricName === "Reputation.BounceRate" ? 0.1 : 0.01)
          )
        },
        metricName,
        window,
        signal
      ),
  }
}

function env(
  overrides: {
    MAIL_TRANSPORT?: "smtp" | "ses"
    SES_MAX_SEND_RATE?: string
  } = {}
) {
  return {
    MAIL_TRANSPORT: overrides.MAIL_TRANSPORT ?? ("ses" as const),
    SES_REGION: "us-east-1",
    SES_MAX_SEND_RATE: overrides.SES_MAX_SEND_RATE ?? "14",
  }
}

beforeEach(() => {
  openAlert.mockReset()
  closeAlert.mockReset()
  openAlert.mockResolvedValue({ created: true, alert: { id: "a" } })
  closeAlert.mockResolvedValue({ closed: false, alert: null })
})

describe("ses-health AWS reads", () => {
  it("requests GetAccount and both reputation metrics over the previous 24 hours", async () => {
    const redis = memoryRedis()
    const pauseSendEmail = vi.fn(async () => undefined)
    const metricCommands: GetMetricStatisticsCommand[] = []
    const accountCommands: GetAccountCommand[] = []
    const window = sesReputationWindow(NOW)

    await processSesHealthJob({
      env: env(),
      db: {} as never,
      redis,
      pauseSendEmail,
      now: NOW,
      clients: clients({
        onAccount: (command) => accountCommands.push(command),
        onMetric: (command) => metricCommands.push(command),
        bounce: {
          Datapoints: [
            {
              Timestamp: new Date("2026-11-17T12:00:00.000Z"),
              Average: 9,
              Unit: "Percent",
            },
            {
              Timestamp: new Date("2026-11-18T11:45:00.000Z"),
              Average: 1.25,
              Unit: "Percent",
            },
          ],
        },
        complaint: points(0.01),
      }),
    })

    expect(accountCommands[0]).toBeInstanceOf(GetAccountCommand)
    expect(accountCommands[0]?.input).toEqual({})
    expect(metricCommands.map((command) => command.input.MetricName)).toEqual([
      "Reputation.BounceRate",
      "Reputation.ComplaintRate",
    ])
    for (const command of metricCommands) {
      expect(command.input).toMatchObject({
        Namespace: "AWS/SES",
        Period: 900,
        Statistics: ["Average"],
        Unit: "Percent",
      })
      expect(command.input.Dimensions).toBeUndefined()
      expect(command.input.StartTime).toEqual(window.start)
      expect(command.input.EndTime).toEqual(window.end)
    }
    expect(pauseSendEmail).not.toHaveBeenCalled()
    expect(openAlert).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: SES_HEALTH_ALERTS.bounceWarning.type })
    )
  })

  it("still checks SES while send-email is already paused", async () => {
    const getAccount = vi.fn(async () => healthyAccount())
    await processSesHealthJob({
      env: env(),
      db: {} as never,
      redis: memoryRedis(),
      pauseSendEmail: vi.fn(async () => undefined),
      now: NOW,
      clients: clients({ account: getAccount }),
    })
    expect(getAccount).toHaveBeenCalledOnce()
  })
})

describe("ses-health decisions", () => {
  async function run(input: {
    account?: AccountResult | (() => Promise<AccountResult>)
    bounce?: MetricResult | (() => Promise<MetricResult>)
    complaint?: MetricResult | (() => Promise<MetricResult>)
    previous?: Array<
      | "bounce_critical"
      | "complaint_critical"
      | "sending_disabled"
      | "enforcement_restricted"
    >
    rate?: string
  }) {
    const redis = memoryRedis()
    if (input.previous) {
      await redis.set(
        SES_SENDING_SAFETY_REDIS_KEY,
        serializeSesSendingSafety({
          reasons: input.previous,
          updatedAt: NOW.toISOString(),
        })
      )
    }
    const pauseSendEmail = vi.fn(async () => undefined)
    const resumeSendEmail = vi.fn(async () => undefined)
    const drainSendEmail = vi.fn(async () => undefined)
    const result = await processSesHealthJob({
      env: env({ SES_MAX_SEND_RATE: input.rate }),
      db: {} as never,
      redis,
      pauseSendEmail,
      now: NOW,
      clients: clients(input),
    })
    return { result, pauseSendEmail, resumeSendEmail, drainSendEmail, redis }
  }

  it("pauses on a critical bounce and keeps the queued-job hooks unused", async () => {
    const ran = await run({ bounce: points(4), complaint: points(0.01) })
    expect(ran.result.paused).toBe(true)
    expect(ran.result.reasons).toEqual(["bounce_critical"])
    expect(ran.pauseSendEmail).toHaveBeenCalledOnce()
    expect(ran.resumeSendEmail).not.toHaveBeenCalled()
    expect(ran.drainSendEmail).not.toHaveBeenCalled()
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: SES_HEALTH_ALERTS.bounceCritical.type,
        dedupeKey: SES_HEALTH_ALERTS.bounceCritical.dedupeKey,
        refreshPayload: true,
      })
    )
  })

  it("pauses when either complaint or bounce is critical", async () => {
    const complaint = await run({ bounce: points(1), complaint: points(0.08) })
    expect(complaint.result.reasons).toEqual(["complaint_critical"])
    expect(complaint.pauseSendEmail).toHaveBeenCalledOnce()
  })

  it("warns at the exact warning thresholds without pausing", async () => {
    const ran = await run({ bounce: points(2), complaint: points(0.05) })
    expect(ran.result.paused).toBe(false)
    expect(ran.pauseSendEmail).not.toHaveBeenCalled()
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: SES_HEALTH_ALERTS.bounceWarning.type })
    )
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: SES_HEALTH_ALERTS.complaintWarning.type })
    )
  })

  it("pauses when SES disables sending or shuts the account down", async () => {
    const disabled = await run({
      account: { ...healthyAccount(), SendingEnabled: false },
    })
    expect(disabled.result.reasons).toContain("sending_disabled")
    expect(disabled.pauseSendEmail).toHaveBeenCalledOnce()

    const shutdown = await run({
      account: { ...healthyAccount(), EnforcementStatus: "SHUTDOWN" },
    })
    expect(shutdown.result.reasons).toContain("enforcement_restricted")
    expect(shutdown.pauseSendEmail).toHaveBeenCalledOnce()
    expect(shutdown.resumeSendEmail).not.toHaveBeenCalled()
  })

  it("does not pause or invent zeros when quota or datapoints are missing", async () => {
    const ran = await run({
      account: {
        SendingEnabled: true,
        EnforcementStatus: "HEALTHY",
        SendQuota: { SentLast24Hours: 1 },
      },
      bounce: { Datapoints: [] },
      complaint: { Datapoints: [] },
    })
    expect(ran.pauseSendEmail).not.toHaveBeenCalled()
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: SES_HEALTH_ALERTS.healthCheckFailed.type,
        dedupeKey: SES_HEALTH_ALERTS.healthCheckFailed.dedupeKey,
      })
    )
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: SES_HEALTH_ALERTS.reputationUnavailable.type,
      })
    )
  })

  it("keeps an existing pause when metrics are missing", async () => {
    const ran = await run({
      previous: ["bounce_critical"],
      bounce: { Datapoints: [] },
      complaint: points(0.01),
    })
    expect(ran.result.reasons).toContain("bounce_critical")
    expect(ran.pauseSendEmail).toHaveBeenCalledOnce()
    expect(ran.resumeSendEmail).not.toHaveBeenCalled()
    expect(closeAlert).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dedupeKey: SES_HEALTH_ALERTS.bounceCritical.dedupeKey,
      })
    )
  })

  it("does not resume after a verified recovery", async () => {
    const ran = await run({
      previous: ["bounce_critical"],
      bounce: points(0.4),
      complaint: points(0.01),
    })
    expect(ran.result.paused).toBe(false)
    expect(ran.result.reasons).toEqual([])
    expect(ran.pauseSendEmail).not.toHaveBeenCalled()
    expect(ran.resumeSendEmail).not.toHaveBeenCalled()
    expect(closeAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: SES_HEALTH_ALERTS.bounceCritical.type,
        dedupeKey: SES_HEALTH_ALERTS.bounceCritical.dedupeKey,
      })
    )
  })

  it("records throttling and access errors without treating them as healthy", async () => {
    const throttled = await run({
      previous: ["sending_disabled"],
      account: async () =>
        Promise.reject(
          Object.assign(new Error("slow"), {
            name: "TooManyRequestsException",
            $metadata: { httpStatusCode: 429 },
          })
        ),
    })
    expect(throttled.pauseSendEmail).toHaveBeenCalledOnce()
    expect(throttled.redis.snapshot()).toContain("sending_disabled")
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: SES_HEALTH_ALERTS.healthCheckFailed.type,
        payload: expect.objectContaining({ failureKind: "throttled" }),
      })
    )

    openAlert.mockClear()
    const denied = await run({
      account: async () =>
        Promise.reject(
          Object.assign(new Error("no"), {
            name: "AccessDeniedException",
            $metadata: { httpStatusCode: 403 },
          })
        ),
    })
    expect(denied.pauseSendEmail).not.toHaveBeenCalled()
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        payload: expect.objectContaining({ failureKind: "access_denied" }),
      })
    )
  })

  it("records a CloudWatch failure without closing reputation alerts", async () => {
    const ran = await run({
      previous: ["complaint_critical"],
      complaint: async () => Promise.reject(new Error("ECONNRESET")),
    })
    expect(ran.result.reasons).toContain("complaint_critical")
    expect(ran.resumeSendEmail).not.toHaveBeenCalled()
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: SES_HEALTH_ALERTS.healthCheckFailed.type,
        payload: expect.objectContaining({ reason: "aws_error" }),
      })
    )
  })

  it("dedupes a rate mismatch and closes it when the rate matches", async () => {
    await run({
      account: {
        ...healthyAccount(),
        SendQuota: { ...healthyAccount().SendQuota, MaxSendRate: 10 },
      },
    })
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: SES_HEALTH_ALERTS.sendRateMismatch.type,
        dedupeKey: SES_HEALTH_ALERTS.sendRateMismatch.dedupeKey,
        payload: expect.objectContaining({
          configuredSendRate: 14,
          actualSendRate: 10,
        }),
      })
    )

    openAlert.mockClear()
    openAlert.mockResolvedValue({ created: false, alert: { id: "a" } })
    await run({
      account: {
        ...healthyAccount(),
        SendQuota: { ...healthyAccount().SendQuota, MaxSendRate: 10 },
      },
    })
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dedupeKey: SES_HEALTH_ALERTS.sendRateMismatch.dedupeKey,
      })
    )

    openAlert.mockClear()
    closeAlert.mockClear()
    const matched = await run({})
    expect(openAlert).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: SES_HEALTH_ALERTS.sendRateMismatch.type })
    )
    expect(closeAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dedupeKey: SES_HEALTH_ALERTS.sendRateMismatch.dedupeKey,
      })
    )
    expect(matched.pauseSendEmail).not.toHaveBeenCalled()
  })

  it("does not overlap two health checks", async () => {
    const redis = memoryRedis()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const getAccount = vi.fn(async () => {
      await gate
      return healthyAccount()
    })
    const first = processSesHealthJob({
      env: env(),
      db: {} as never,
      redis,
      pauseSendEmail: vi.fn(async () => undefined),
      now: NOW,
      clients: clients({ account: getAccount }),
    })
    await vi.waitFor(() => {
      expect(getAccount).toHaveBeenCalledOnce()
    })
    const second = await processSesHealthJob({
      env: env(),
      db: {} as never,
      redis,
      pauseSendEmail: vi.fn(async () => undefined),
      now: NOW,
      clients: clients({ account: getAccount }),
    })
    expect(second.outcome).toBe("overlapped")
    expect(getAccount).toHaveBeenCalledOnce()
    release()
    await expect(first).resolves.toMatchObject({ outcome: "checked" })
  })

  it("skips AWS when mail is not SES", async () => {
    const getAccount = vi.fn(async () => healthyAccount())
    const result = await processSesHealthJob({
      env: env({ MAIL_TRANSPORT: "smtp" }),
      db: {} as never,
      redis: memoryRedis(),
      pauseSendEmail: vi.fn(async () => undefined),
      clients: clients({ account: getAccount }),
    })
    expect(result.outcome).toBe("skipped")
    expect(getAccount).not.toHaveBeenCalled()
  })
})

describe("persisted SES sending pause", () => {
  it("makes a restarted worker and a second worker pause from the same state", async () => {
    const redis = memoryRedis()
    await redis.set(
      SES_SENDING_SAFETY_REDIS_KEY,
      serializeSesSendingSafety({
        reasons: ["enforcement_restricted"],
        updatedAt: NOW.toISOString(),
      })
    )
    const first = vi.fn(async () => undefined)
    const second = vi.fn(async () => undefined)
    await expect(enforcePersistedSesSendingPause(redis, first)).resolves.toBe(
      true
    )
    await expect(enforcePersistedSesSendingPause(redis, second)).resolves.toBe(
      true
    )
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })

  it("does not pause a restart when no safety reason is stored", async () => {
    const pause = vi.fn(async () => undefined)
    await expect(
      enforcePersistedSesSendingPause(memoryRedis(), pause)
    ).resolves.toBe(false)
    expect(pause).not.toHaveBeenCalled()
  })
})
