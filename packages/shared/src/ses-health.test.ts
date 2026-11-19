import { describe, expect, it } from "vitest"

import {
  SES_BOUNCE_CRITICAL_PERCENT,
  SES_BOUNCE_WARNING_PERCENT,
  SES_COMPLAINT_CRITICAL_PERCENT,
  SES_COMPLAINT_WARNING_PERCENT,
  SES_HEALTH_ALERTS,
  SES_SENDING_SAFETY_REDIS_KEY,
  SES_SEND_RATE_EPSILON,
  classifyAwsFailure,
  enforcementEffect,
  evaluateSesHealth,
  isSesSendingBlocked,
  latestReputationPercent,
  parseSesSendingSafety,
  planSesHealthFailure,
  publicAwsFailureName,
  sendRatesMatch,
  serializeSesSendingSafety,
  type MetricObservation,
  type SesAccountSnapshot,
  type SesAlertIntent,
  type SesHealthPlan,
  type SesPauseReason,
} from "./ses-health.js"

const NOW = new Date("2026-11-18T12:00:00.000Z")
const LATEST = "2026-11-18T11:45:00.000Z"

function account(
  overrides: Partial<SesAccountSnapshot> = {}
): SesAccountSnapshot {
  return {
    sendingEnabled: true,
    enforcementStatus: "HEALTHY",
    productionAccessEnabled: true,
    max24HourSend: 50_000,
    sentLast24Hours: 10,
    maxSendRate: 14,
    ...overrides,
  }
}

function rate(percent: number): MetricObservation {
  return {
    status: "ok",
    reading: {
      kind: "rate",
      percent,
      samples: 1,
      latestAt: LATEST,
    },
  }
}

function missing(): MetricObservation {
  return { status: "ok", reading: { kind: "missing" } }
}

function evaluate(
  overrides: Partial<Parameters<typeof evaluateSesHealth>[0]> = {}
): SesHealthPlan {
  return evaluateSesHealth({
    account: account(),
    bounce: rate(0.1),
    complaint: rate(0.01),
    configuredSendRate: 14,
    previousReasons: [],
    now: NOW,
    ...overrides,
  })
}

function opened(plan: SesHealthPlan, type: string): SesAlertIntent | undefined {
  return plan.alerts.find(
    (alert) => alert.action === "open" && alert.type === type
  )
}

function closed(plan: SesHealthPlan, type: string): SesAlertIntent | undefined {
  return plan.alerts.find(
    (alert) => alert.action === "close" && alert.type === type
  )
}

describe("SES reputation aggregation", () => {
  it("uses the latest percentage and does not sum or average points", () => {
    const reading = latestReputationPercent([
      {
        timestampMs: Date.parse("2026-11-17T12:00:00.000Z"),
        average: 10,
        unit: "Percent",
      },
      {
        timestampMs: Date.parse(LATEST),
        average: 1.5,
        unit: "Percent",
      },
      {
        timestampMs: Date.parse("2026-11-18T06:00:00.000Z"),
        average: 3,
        unit: "Percent",
      },
    ])

    expect(reading).toEqual({
      kind: "rate",
      percent: 1.5,
      samples: 3,
      latestAt: LATEST,
    })
  })

  it("treats an empty window as missing rather than zero", () => {
    expect(latestReputationPercent([])).toEqual({ kind: "missing" })
    expect(
      latestReputationPercent([
        { timestampMs: Date.parse(LATEST), average: null, unit: "Percent" },
      ])
    ).toEqual({ kind: "missing" })
  })

  it("rejects a non-percent unit instead of rescaling it", () => {
    expect(
      latestReputationPercent([
        { timestampMs: Date.parse(LATEST), average: 0.02, unit: "None" },
      ])
    ).toEqual({ kind: "invalid" })
  })
})

describe("SES health thresholds", () => {
  it("uses the documented percentages", () => {
    expect(SES_BOUNCE_WARNING_PERCENT).toBe(2)
    expect(SES_BOUNCE_CRITICAL_PERCENT).toBe(4)
    expect(SES_COMPLAINT_WARNING_PERCENT).toBe(0.05)
    expect(SES_COMPLAINT_CRITICAL_PERCENT).toBe(0.08)
  })

  it("stays quiet below the warning thresholds", () => {
    const plan = evaluate({ bounce: rate(1.99), complaint: rate(0.049) })
    expect(plan.pause).toBe(false)
    expect(plan.reasons).toEqual([])
    expect(opened(plan, SES_HEALTH_ALERTS.bounceWarning.type)).toBeUndefined()
    expect(
      opened(plan, SES_HEALTH_ALERTS.complaintWarning.type)
    ).toBeUndefined()
    expect(closed(plan, SES_HEALTH_ALERTS.bounceCritical.type)).toBeDefined()
    expect(closed(plan, SES_HEALTH_ALERTS.complaintCritical.type)).toBeDefined()
  })

  it("opens a bounce warning at exactly 2% without pausing", () => {
    const plan = evaluate({ bounce: rate(2) })
    expect(plan.pause).toBe(false)
    expect(opened(plan, SES_HEALTH_ALERTS.bounceWarning.type)).toMatchObject({
      severity: "warning",
      dedupeKey: SES_HEALTH_ALERTS.bounceWarning.dedupeKey,
      payload: { ratePercent: 2, thresholdPercent: 2, unit: "percent" },
    })
    expect(closed(plan, SES_HEALTH_ALERTS.bounceCritical.type)).toBeDefined()
  })

  it("pauses at a bounce rate of exactly 4%", () => {
    const plan = evaluate({ bounce: rate(4) })
    expect(plan.pause).toBe(true)
    expect(plan.reasons).toEqual(["bounce_critical"])
    expect(opened(plan, SES_HEALTH_ALERTS.bounceCritical.type)).toMatchObject({
      severity: "critical",
      dedupeKey: SES_HEALTH_ALERTS.bounceCritical.dedupeKey,
    })
    expect(opened(plan, SES_HEALTH_ALERTS.bounceWarning.type)).toBeDefined()
  })

  it("opens a complaint warning at exactly 0.05% without pausing", () => {
    const plan = evaluate({ complaint: rate(0.05) })
    expect(plan.pause).toBe(false)
    expect(opened(plan, SES_HEALTH_ALERTS.complaintWarning.type)).toMatchObject(
      {
        severity: "warning",
        dedupeKey: SES_HEALTH_ALERTS.complaintWarning.dedupeKey,
        payload: { ratePercent: 0.05, thresholdPercent: 0.05 },
      }
    )
  })

  it("pauses at a complaint rate of exactly 0.08%", () => {
    const plan = evaluate({ complaint: rate(0.08) })
    expect(plan.pause).toBe(true)
    expect(plan.reasons).toEqual(["complaint_critical"])
    expect(
      opened(plan, SES_HEALTH_ALERTS.complaintCritical.type)
    ).toMatchObject({
      severity: "critical",
      dedupeKey: SES_HEALTH_ALERTS.complaintCritical.dedupeKey,
    })
  })

  it("pauses when either critical threshold is reached", () => {
    const plan = evaluate({ bounce: rate(1), complaint: rate(0.08) })
    expect(plan.reasons).toEqual(["complaint_critical"])
    expect(plan.pause).toBe(true)
  })

  it("keeps the same dedupe keys on a repeated check", () => {
    const first = evaluate({ bounce: rate(4), complaint: rate(0.08) })
    const second = evaluate({
      bounce: rate(4.2),
      complaint: rate(0.09),
      previousReasons: first.reasons,
    })
    expect(
      opened(second, SES_HEALTH_ALERTS.bounceCritical.type)?.dedupeKey
    ).toBe(opened(first, SES_HEALTH_ALERTS.bounceCritical.type)?.dedupeKey)
    expect(
      opened(second, SES_HEALTH_ALERTS.complaintCritical.type)?.dedupeKey
    ).toBe(opened(first, SES_HEALTH_ALERTS.complaintCritical.type)?.dedupeKey)
  })
})

describe("SES account safety", () => {
  it("pauses when sending is disabled", () => {
    const plan = evaluate({
      account: account({ sendingEnabled: false }),
    })
    expect(plan.reasons).toContain("sending_disabled")
    expect(plan.pause).toBe(true)
    expect(opened(plan, SES_HEALTH_ALERTS.sendingDisabled.type)).toMatchObject({
      severity: "critical",
      dedupeKey: SES_HEALTH_ALERTS.sendingDisabled.dedupeKey,
    })
  })

  it("pauses on shutdown and any unknown enforcement status", () => {
    expect(enforcementEffect("SHUTDOWN")).toBe("restricted")
    expect(enforcementEffect("REVIEW")).toBe("restricted")
    const plan = evaluate({
      account: account({ enforcementStatus: "SHUTDOWN" }),
    })
    expect(plan.reasons).toContain("enforcement_restricted")
    expect(
      opened(plan, SES_HEALTH_ALERTS.enforcementRestricted.type)
    ).toMatchObject({ severity: "critical" })
  })

  it("warns on probation without a sending pause", () => {
    const plan = evaluate({
      account: account({ enforcementStatus: "PROBATION" }),
    })
    expect(plan.pause).toBe(false)
    expect(plan.reasons).not.toContain("enforcement_restricted")
    expect(
      opened(plan, SES_HEALTH_ALERTS.enforcementProbation.type)
    ).toMatchObject({ severity: "warning", payload: { sendingAllowed: true } })
  })

  it("does not treat missing quota or metrics as healthy or as zero", () => {
    const plan = evaluate({
      account: account({ max24HourSend: null, maxSendRate: null }),
      bounce: missing(),
      complaint: missing(),
      previousReasons: ["bounce_critical"],
    })
    expect(plan.reasons).toEqual(["bounce_critical"])
    expect(plan.pause).toBe(true)
    expect(
      opened(plan, SES_HEALTH_ALERTS.healthCheckFailed.type)
    ).toMatchObject({
      payload: {
        reason: "incomplete_account",
        missing: expect.arrayContaining(["max24HourSend", "maxSendRate"]),
      },
    })
    expect(
      opened(plan, SES_HEALTH_ALERTS.reputationUnavailable.type)
    ).toMatchObject({
      payload: { bounce: "missing", complaint: "missing" },
    })
    expect(closed(plan, SES_HEALTH_ALERTS.bounceCritical.type)).toBeUndefined()
    expect(
      closed(plan, SES_HEALTH_ALERTS.sendRateMismatch.type)
    ).toBeUndefined()
  })

  it("keeps prior restrictions when CloudWatch fails", () => {
    const plan = evaluate({
      bounce: { status: "error", failureKind: "throttled" },
      complaint: { status: "error", failureKind: "throttled" },
      previousReasons: ["complaint_critical"],
    })
    expect(plan.reasons).toEqual(["complaint_critical"])
    expect(
      opened(plan, SES_HEALTH_ALERTS.healthCheckFailed.type)
    ).toMatchObject({
      payload: { reason: "aws_error" },
    })
    expect(
      closed(plan, SES_HEALTH_ALERTS.complaintCritical.type)
    ).toBeUndefined()
    expect(
      opened(plan, SES_HEALTH_ALERTS.reputationUnavailable.type)
    ).toBeUndefined()
  })

  it("clears alert intents after a verified recovery without a resume flag", () => {
    const plan = evaluate({
      previousReasons: ["bounce_critical", "complaint_critical"],
    })
    expect(plan.pause).toBe(false)
    expect(plan.reasons).toEqual([])
    expect(plan.replaceReasons).toBe(true)
    expect(closed(plan, SES_HEALTH_ALERTS.bounceWarning.type)).toBeDefined()
    expect(closed(plan, SES_HEALTH_ALERTS.bounceCritical.type)).toBeDefined()
    expect(closed(plan, SES_HEALTH_ALERTS.complaintWarning.type)).toBeDefined()
    expect(closed(plan, SES_HEALTH_ALERTS.complaintCritical.type)).toBeDefined()
    expect("resume" in plan).toBe(false)
  })
})

describe("SES send rate mismatch", () => {
  it("matches within the floating-point tolerance", () => {
    expect(SES_SEND_RATE_EPSILON).toBe(1e-6)
    expect(sendRatesMatch(14, 14)).toBe(true)
    expect(sendRatesMatch(14, 14.0000001)).toBe(true)
    expect(sendRatesMatch(14, 14.001)).toBe(false)
  })

  it("opens one stable warning when the configured rate differs", () => {
    const plan = evaluate({
      account: account({ maxSendRate: 10 }),
    })
    expect(plan.pause).toBe(false)
    expect(opened(plan, SES_HEALTH_ALERTS.sendRateMismatch.type)).toMatchObject(
      {
        severity: "warning",
        dedupeKey: SES_HEALTH_ALERTS.sendRateMismatch.dedupeKey,
        payload: {
          configuredSendRate: 14,
          actualSendRate: 10,
          unit: "sends_per_second",
        },
      }
    )
  })

  it("closes the warning after the rates match", () => {
    const plan = evaluate()
    expect(
      opened(plan, SES_HEALTH_ALERTS.sendRateMismatch.type)
    ).toBeUndefined()
    expect(closed(plan, SES_HEALTH_ALERTS.sendRateMismatch.type)).toBeDefined()
  })
})

describe("SES health failure plan", () => {
  it("classifies throttling, access denial, and missing credentials", () => {
    expect(
      classifyAwsFailure(
        Object.assign(new Error("slow"), {
          name: "TooManyRequestsException",
          $metadata: { httpStatusCode: 429 },
        })
      )
    ).toBe("throttled")
    expect(
      classifyAwsFailure(
        Object.assign(new Error("denied"), {
          name: "AccessDeniedException",
          $metadata: { httpStatusCode: 403 },
        })
      )
    ).toBe("access_denied")
    expect(
      classifyAwsFailure(
        Object.assign(new Error("forbidden"), {
          name: "Error",
          $metadata: { httpStatusCode: 401 },
        })
      )
    ).toBe("access_denied")
    expect(
      classifyAwsFailure(
        Object.assign(new Error("Could not load credentials"), {
          name: "CredentialsProviderError",
        })
      )
    ).toBe("credentials")
    expect(classifyAwsFailure(new Error("missing credentials from env"))).toBe(
      "credentials"
    )
  })

  it("classifies timeout, network, and unknown AWS failures", () => {
    expect(
      classifyAwsFailure(
        Object.assign(new Error("aborted"), { name: "TimeoutError" })
      )
    ).toBe("timeout")
    expect(
      classifyAwsFailure(new Error("request timeout while calling SES"))
    ).toBe("timeout")
    expect(
      classifyAwsFailure(
        Object.assign(new Error("offline"), { name: "NetworkingError" })
      )
    ).toBe("network")
    expect(classifyAwsFailure(new Error("getaddrinfo ENOTFOUND"))).toBe(
      "network"
    )
    expect(classifyAwsFailure(new Error("something else"))).toBe("unknown")
    expect(classifyAwsFailure("not-an-error")).toBe("unknown")
  })

  it("ignores non-finite reputation rates instead of treating them as zero", () => {
    const plan = evaluate({
      bounce: rate(Number.NaN),
      complaint: rate(Number.POSITIVE_INFINITY),
      previousReasons: ["bounce_critical"],
    })
    expect(plan.reasons).toEqual(["bounce_critical"])
    expect(plan.pause).toBe(true)
    expect(closed(plan, SES_HEALTH_ALERTS.bounceCritical.type)).toBeUndefined()
    expect(
      closed(plan, SES_HEALTH_ALERTS.complaintCritical.type)
    ).toBeUndefined()
  })

  it("reports a stable public AWS failure name", () => {
    expect(
      publicAwsFailureName(
        Object.assign(new Error("x"), { name: "AccessDeniedException" })
      )
    ).toBe("AccessDeniedException")
    expect(
      publicAwsFailureName(Object.assign(new Error("x"), { name: "  " }))
    ).toBe("Error")
    expect(publicAwsFailureName("plain")).toBe("Error")
  })

  it("keeps previous pause reasons and does not replace them", () => {
    const previous: SesPauseReason[] = ["sending_disabled"]
    const plan = planSesHealthFailure({
      failureKind: "throttled",
      source: "ses",
      previousReasons: previous,
    })
    expect(plan.replaceReasons).toBe(false)
    expect(plan.pause).toBe(true)
    expect(plan.reasons).toEqual(["sending_disabled"])
    expect(plan.alerts).toEqual([
      expect.objectContaining({
        action: "open",
        type: SES_HEALTH_ALERTS.healthCheckFailed.type,
        dedupeKey: SES_HEALTH_ALERTS.healthCheckFailed.dedupeKey,
      }),
    ])
  })
})

describe("SES sending safety state", () => {
  it("round-trips pause reasons and fails closed on a bad payload", async () => {
    const serialized = serializeSesSendingSafety({
      reasons: ["complaint_critical", "bounce_critical"],
      updatedAt: NOW.toISOString(),
    })
    expect(parseSesSendingSafety(serialized)).toEqual({
      reasons: ["bounce_critical", "complaint_critical"],
      updatedAt: NOW.toISOString(),
    })
    expect(parseSesSendingSafety("{")).toBe("invalid")

    const redis = {
      async get(key: string) {
        expect(key).toBe(SES_SENDING_SAFETY_REDIS_KEY)
        return serialized
      },
    }
    await expect(isSesSendingBlocked(redis)).resolves.toBe(true)
    await expect(isSesSendingBlocked({ get: async () => null })).resolves.toBe(
      false
    )
    await expect(isSesSendingBlocked({ get: async () => "[]" })).resolves.toBe(
      true
    )
    await expect(
      isSesSendingBlocked({
        get: async () => Promise.reject(new Error("down")),
      })
    ).resolves.toBe(true)
  })
})
