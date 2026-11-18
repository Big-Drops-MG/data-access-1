import { beforeEach, describe, expect, it, vi } from "vitest"

const openAlert = vi.hoisted(() => vi.fn())
const closeAlert = vi.hoisted(() => vi.fn())
const writeAudit = vi.hoisted(() => vi.fn())
const enqueueDnsCheckJob = vi.hoisted(() => vi.fn())

vi.mock("./alerts.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, openAlert, closeAlert }
})

vi.mock("./audit.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, writeAudit }
})

vi.mock("./dns-check-queue.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, enqueueDnsCheckJob }
})

import {
  DNS_CHECK_FAILED_ALERT_TYPE,
  DOMAIN_PENDING_72H_ALERT_TYPE,
  dnsCheckFailedAlertDedupeKey,
  domainPending72hAlertDedupeKey,
  processDnsCheckJob,
  runDomainDnsCheck,
} from "./dns-check.js"
import { DNS_PROPAGATION_WINDOW_MS } from "./check-dns.js"

const DOMAIN_ID = "019a0000-0000-7000-8000-0000000000aa"
const RECORD_ID = "019a0000-0000-7000-8000-0000000000bb"
const NOW = new Date("2026-11-18T12:00:00.000Z")

function selectChain(result: unknown) {
  const chain: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    then: (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise<unknown>
  } = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.orderBy.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

function updateChain() {
  const where = vi.fn(async () => undefined)
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return { update, set, where }
}

function domainRow(
  overrides: Partial<{
    id: string
    name: string
    status: "pending" | "verifying" | "verified" | "failed" | "inactive"
    createdAt: Date
    verifiedAt: Date | null
  }> = {}
) {
  return {
    id: DOMAIN_ID,
    name: "send.example.com",
    status: "pending" as const,
    createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    verifiedAt: null,
    ...overrides,
  }
}

function dnsRow(
  overrides: Partial<{
    id: string
    domainId: string
    purpose: "spf" | "dkim" | "dmarc" | "mx"
    name: string
    recordType: string
    expectedValue: string
    status: "pending" | "pending_propagation" | "pass" | "fail"
  }> = {}
) {
  return {
    id: RECORD_ID,
    domainId: DOMAIN_ID,
    purpose: "spf" as const,
    name: "send.example.com",
    recordType: "TXT",
    expectedValue: "v=spf1 include:amazonses.com ~all",
    status: "pending" as const,
    ...overrides,
  }
}

describe("dns-check alerts", () => {
  it("uses stable dedupe keys and alert types", () => {
    expect(DNS_CHECK_FAILED_ALERT_TYPE).toBe("dns_check_failed")
    expect(DOMAIN_PENDING_72H_ALERT_TYPE).toBe("domain_pending_72h")
    expect(dnsCheckFailedAlertDedupeKey(DOMAIN_ID)).toBe(
      `dns_check_failed:${DOMAIN_ID}`
    )
    expect(domainPending72hAlertDedupeKey(DOMAIN_ID)).toBe(
      `domain_pending_72h:${DOMAIN_ID}`
    )
  })
})

describe("runDomainDnsCheck", () => {
  const txUpdates = updateChain()
  let selectResults: unknown[]
  let db: {
    select: ReturnType<typeof vi.fn>
    transaction: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    openAlert.mockReset()
    closeAlert.mockReset()
    writeAudit.mockReset()
    enqueueDnsCheckJob.mockReset()
    openAlert.mockResolvedValue({ created: true })
    closeAlert.mockResolvedValue({ closed: true })
    writeAudit.mockResolvedValue({ id: "audit-1" })
    selectResults = []
    txUpdates.update.mockClear()
    txUpdates.set.mockClear()
    txUpdates.where.mockClear()
    db = {
      select: vi.fn(() => {
        const next = selectResults.shift()
        return selectChain(next ?? [])
      }),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
        await fn({ update: txUpdates.update })
      }),
    }
  })

  it("throws when the domain is missing", async () => {
    selectResults = [[]]
    await expect(
      runDomainDnsCheck(DOMAIN_ID, { db: db as never, now: NOW })
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    })
  })

  it("skips inactive domains without writing", async () => {
    selectResults = [[domainRow({ status: "inactive" })]]
    await expect(
      runDomainDnsCheck(DOMAIN_ID, { db: db as never, now: NOW })
    ).resolves.toMatchObject({
      status: "inactive",
      allPass: false,
      recordCount: 0,
    })
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it("verifies when DNS and SES both pass", async () => {
    selectResults = [[domainRow({ status: "verifying" })], [dnsRow()]]
    const getSesIdentityVerified = vi.fn(async () => true)
    const result = await runDomainDnsCheck(DOMAIN_ID, {
      db: db as never,
      now: NOW,
      lookup: async () => ({
        kind: "found",
        values: ["v=spf1 include:amazonses.com ~all"],
      }),
      getSesIdentityVerified,
      actor: { type: "user", id: DOMAIN_ID },
      requestId: "req-1",
    })

    expect(result).toMatchObject({
      status: "verified",
      allPass: true,
      passingCount: 1,
      sesIdentityVerified: true,
    })
    expect(getSesIdentityVerified).toHaveBeenCalledWith("send.example.com")
    expect(openAlert).not.toHaveBeenCalled()
    expect(closeAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: DNS_CHECK_FAILED_ALERT_TYPE })
    )
    expect(closeAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: DOMAIN_PENDING_72H_ALERT_TYPE })
    )
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "domain.check",
        actor: { type: "user", id: DOMAIN_ID },
        requestId: "req-1",
      })
    )
    expect(txUpdates.set).toHaveBeenCalled()
  })

  it("stays verifying when SES is not verified yet", async () => {
    selectResults = [[domainRow({ status: "pending" })], [dnsRow()]]
    const result = await runDomainDnsCheck(DOMAIN_ID, {
      db: db as never,
      now: NOW,
      lookup: async () => ({
        kind: "found",
        values: ["v=spf1 include:amazonses.com ~all"],
      }),
      getSesIdentityVerified: async () => false,
    })
    expect(result.status).toBe("verifying")
    expect(result.sesIdentityVerified).toBe(false)
  })

  it("treats SES lookup failures as unknown and still promotes on DNS pass", async () => {
    selectResults = [[domainRow({ status: "pending" })], [dnsRow()]]
    const result = await runDomainDnsCheck(DOMAIN_ID, {
      db: db as never,
      now: NOW,
      lookup: async () => ({
        kind: "found",
        values: ["v=spf1 include:amazonses.com ~all"],
      }),
      getSesIdentityVerified: async () => {
        throw new Error("ses down")
      },
    })
    expect(result.status).toBe("verified")
    expect(result.sesIdentityVerified).toBeNull()
  })

  it("degrades a verified domain and opens dns_check_failed", async () => {
    selectResults = [
      [domainRow({ status: "verified", verifiedAt: NOW })],
      [dnsRow({ status: "pass" })],
    ]
    const result = await runDomainDnsCheck(DOMAIN_ID, {
      db: db as never,
      now: NOW,
      lookup: async () => ({ kind: "not_found" }),
    })
    expect(result.status).toBe("failed")
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: DNS_CHECK_FAILED_ALERT_TYPE,
        dedupeKey: dnsCheckFailedAlertDedupeKey(DOMAIN_ID),
      })
    )
  })

  it("opens domain_pending_72h when still pending after the window", async () => {
    const createdAt = new Date(NOW.getTime() - DNS_PROPAGATION_WINDOW_MS - 1000)
    selectResults = [[domainRow({ status: "pending", createdAt })], [dnsRow()]]
    const result = await runDomainDnsCheck(DOMAIN_ID, {
      db: db as never,
      now: NOW,
      lookup: async () => ({ kind: "not_found" }),
    })
    expect(result.status).toBe("pending")
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: DOMAIN_PENDING_72H_ALERT_TYPE,
        dedupeKey: domainPending72hAlertDedupeKey(DOMAIN_ID),
      })
    )
  })
})

describe("processDnsCheckJob", () => {
  beforeEach(() => {
    openAlert.mockReset()
    closeAlert.mockReset()
    writeAudit.mockReset()
    enqueueDnsCheckJob.mockReset()
    openAlert.mockResolvedValue({ created: true })
    closeAlert.mockResolvedValue({ closed: true })
    writeAudit.mockResolvedValue({ id: "audit-1" })
    enqueueDnsCheckJob.mockResolvedValue(undefined)
  })

  it("fans out scheduled ticks to active domains", async () => {
    const select = vi.fn(() =>
      selectChain([
        { id: DOMAIN_ID },
        { id: "019a0000-0000-7000-8000-0000000000cc" },
      ])
    )
    const result = await processDnsCheckJob(
      {},
      {
        db: { select } as never,
        monitoringQueue: { add: vi.fn(), getJob: vi.fn() },
        now: NOW,
      }
    )
    expect(result).toEqual({ kind: "fanout", enqueued: 2 })
    expect(enqueueDnsCheckJob).toHaveBeenCalledTimes(2)
  })

  it("skips missing and inactive domains", async () => {
    const selectMissing = vi.fn(() => selectChain([]))
    await expect(
      processDnsCheckJob(
        { domain_id: DOMAIN_ID },
        {
          db: { select: selectMissing } as never,
          monitoringQueue: { add: vi.fn(), getJob: vi.fn() },
          now: NOW,
        }
      )
    ).resolves.toEqual({ kind: "skipped", reason: "missing_domain" })

    const selectInactive = vi.fn(() =>
      selectChain([{ id: DOMAIN_ID, status: "inactive" }])
    )
    await expect(
      processDnsCheckJob(
        { domain_id: DOMAIN_ID },
        {
          db: { select: selectInactive } as never,
          monitoringQueue: { add: vi.fn(), getJob: vi.fn() },
          now: NOW,
        }
      )
    ).resolves.toEqual({ kind: "skipped", reason: "inactive" })
  })

  it("runs a domain check for active domains", async () => {
    const tx = updateChain()
    let calls = 0
    const select = vi.fn(() => {
      calls += 1
      if (calls === 1) {
        return selectChain([{ id: DOMAIN_ID, status: "pending" }])
      }
      if (calls === 2) {
        return selectChain([domainRow({ status: "pending" })])
      }
      return selectChain([dnsRow()])
    })
    const result = await processDnsCheckJob(
      { domain_id: DOMAIN_ID, trigger: "manual", request_id: "req-2" },
      {
        db: {
          select,
          transaction: vi.fn(async (fn: (txDb: unknown) => Promise<void>) => {
            await fn({ update: tx.update })
          }),
        } as never,
        monitoringQueue: { add: vi.fn(), getJob: vi.fn() },
        now: NOW,
        lookup: async () => ({
          kind: "found",
          values: ["v=spf1 include:amazonses.com ~all"],
        }),
      }
    )
    expect(result).toMatchObject({
      kind: "domain",
      result: { status: "verified" },
    })
  })
})
