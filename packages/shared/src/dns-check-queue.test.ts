import { describe, expect, it, vi } from "vitest"

import {
  DNS_CHECK_INTERVAL_MS,
  DNS_CHECK_JOB_NAME,
  DNS_CHECK_JOB_OPTIONS,
  DNS_CHECK_WORKER_CONCURRENCY,
  createEnqueueDnsCheck,
  dnsCheckBucket,
  dnsCheckJobId,
  enqueueDnsCheckJob,
} from "./dns-check-queue.js"

const DOMAIN_ID = "019a0000-0000-7000-8000-0000000000aa"
const REQUEST_ID = "019a0000-0000-7000-8000-0000000000ff"

describe("dns-check-queue", () => {
  it("builds hyphenated job ids and 6h buckets", () => {
    const now = new Date("2026-11-18T08:00:00.000Z")
    const bucket = dnsCheckBucket(now)
    expect(dnsCheckJobId(DOMAIN_ID, bucket)).toBe(`dns-${DOMAIN_ID}-${bucket}`)
    expect(dnsCheckJobId(DOMAIN_ID, bucket)).not.toContain(":")
    expect(DNS_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000)
    expect(DNS_CHECK_WORKER_CONCURRENCY).toBe(3)
    expect(DNS_CHECK_JOB_OPTIONS.attempts).toBe(3)
  })

  it("enqueues a domain job with retry backoff", async () => {
    const add = vi.fn(async () => undefined)
    const now = new Date("2026-11-18T08:00:00.000Z")
    await enqueueDnsCheckJob(
      { add, getJob: vi.fn() },
      {
        domainId: DOMAIN_ID,
        trigger: "manual",
        requestId: REQUEST_ID,
        now,
      }
    )
    expect(add).toHaveBeenCalledWith(
      DNS_CHECK_JOB_NAME,
      expect.objectContaining({
        domain_id: DOMAIN_ID,
        trigger: "manual",
        request_id: REQUEST_ID,
      }),
      expect.objectContaining({
        jobId: dnsCheckJobId(DOMAIN_ID, dnsCheckBucket(now)),
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      })
    )
  })

  it("ignores duplicate scheduled job ids", async () => {
    const add = vi.fn(async () => {
      throw new Error("Job dns-... already exists")
    })
    await expect(
      enqueueDnsCheckJob(
        { add, getJob: vi.fn() },
        {
          domainId: DOMAIN_ID,
          trigger: "scheduled",
          now: new Date("2026-11-18T08:00:00.000Z"),
        }
      )
    ).resolves.toBeUndefined()
  })

  it("rethrows non-duplicate enqueue failures", async () => {
    const add = vi.fn(async () => {
      throw new Error("redis down")
    })
    await expect(
      enqueueDnsCheckJob(
        { add, getJob: vi.fn() },
        {
          domainId: DOMAIN_ID,
          trigger: "manual",
          now: new Date("2026-11-18T08:00:00.000Z"),
        }
      )
    ).rejects.toThrow("redis down")
  })

  it("re-enqueues manual checks after completed jobs", async () => {
    const add = vi
      .fn()
      .mockRejectedValueOnce(new Error("Job dns-... already exists"))
      .mockResolvedValueOnce(undefined)
    const remove = vi.fn(async () => undefined)
    const getState = vi.fn(async () => "completed" as const)
    const getJob = vi.fn(async () => ({ getState, remove }))

    await enqueueDnsCheckJob(
      { add, getJob },
      {
        domainId: DOMAIN_ID,
        trigger: "manual",
        now: new Date("2026-11-18T08:00:00.000Z"),
      }
    )

    expect(remove).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(2)
  })

  it("leaves in-flight manual jobs alone and no-ops when duplicate vanishes", async () => {
    const addWaiting = vi.fn(async () => {
      throw new Error("Job dns-... already exists")
    })
    const getState = vi.fn(async () => "active" as const)
    const remove = vi.fn(async () => undefined)
    await enqueueDnsCheckJob(
      { add: addWaiting, getJob: vi.fn(async () => ({ getState, remove })) },
      {
        domainId: DOMAIN_ID,
        trigger: "manual",
        now: new Date("2026-11-18T08:00:00.000Z"),
      }
    )
    expect(remove).not.toHaveBeenCalled()

    const addGone = vi.fn(async () => {
      throw new Error("Job dns-... duplicated")
    })
    await expect(
      enqueueDnsCheckJob(
        { add: addGone, getJob: vi.fn(async () => undefined) },
        {
          domainId: DOMAIN_ID,
          trigger: "manual",
          now: new Date("2026-11-18T08:00:00.000Z"),
        }
      )
    ).resolves.toBeUndefined()
  })

  it("binds createEnqueueDnsCheck to a queue", async () => {
    const add = vi.fn(async () => undefined)
    const enqueue = createEnqueueDnsCheck({ add, getJob: vi.fn() })
    await enqueue({
      domainId: DOMAIN_ID,
      trigger: "scheduled",
      now: new Date("2026-11-18T08:00:00.000Z"),
    })
    expect(add).toHaveBeenCalledTimes(1)
  })
})
