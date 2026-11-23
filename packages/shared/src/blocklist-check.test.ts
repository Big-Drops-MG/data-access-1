import { beforeEach, describe, expect, it, vi } from "vitest"

const openAlert = vi.hoisted(() => vi.fn())
const closeAlert = vi.hoisted(() => vi.fn())

vi.mock("./alerts.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, openAlert, closeAlert }
})

import {
  BLOCKLIST_LISTED_ALERT_TYPE,
  blocklistListedAlertDedupeKey,
  dnsblQueryName,
  interpretDnsblARecords,
  parseBlocklistCheckIps,
  parseBlocklists,
  processBlocklistCheckJob,
} from "./blocklist-check.js"

const NOW = new Date("2026-11-20T12:00:00.000Z")

function selectChain(result: unknown) {
  const chain: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    then: (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise<unknown>
  } = {
    from: vi.fn(),
    where: vi.fn(),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  return chain
}

function insertChain() {
  const values = vi.fn(async () => undefined)
  const insert = vi.fn(() => ({ values }))
  return { insert, values }
}

describe("blocklist helpers", () => {
  it("parses BLOCKLISTS and BLOCKLIST_CHECK_IPS", () => {
    expect(
      parseBlocklists(" zen.spamhaus.org, b.barracudacentral.org. ")
    ).toEqual(["zen.spamhaus.org", "b.barracudacentral.org"])
    expect(parseBlocklists("")).toEqual([])
    expect(
      parseBlocklistCheckIps("127.0.0.2, not-an-ip, 203.0.113.10")
    ).toEqual(["127.0.0.2", "203.0.113.10"])
  })

  it("builds DNSBL query names for IPs and domains", () => {
    expect(dnsblQueryName("ip", "127.0.0.2", "zen.spamhaus.org")).toBe(
      "2.0.0.127.zen.spamhaus.org"
    )
    expect(
      dnsblQueryName("domain", "Mail.Example.COM.", "zen.spamhaus.org")
    ).toBe("mail.example.com.zen.spamhaus.org")
  })

  it("builds alert dedupe keys", () => {
    expect(blocklistListedAlertDedupeKey("127.0.0.2", "zen.spamhaus.org")).toBe(
      "blocklist:127.0.0.2:zen.spamhaus.org"
    )
  })

  it("treats Spamhaus policy codes as errors, not listings", () => {
    expect(interpretDnsblARecords(["127.255.255.254"])).toEqual({
      listed: null,
      error: "DNSBL policy/error response: 127.255.255.254",
    })
    expect(interpretDnsblARecords(["127.0.0.2"])).toEqual({
      listed: true,
      codes: ["127.0.0.2"],
    })
    expect(interpretDnsblARecords([])).toEqual({ listed: false })
  })
})

describe("processBlocklistCheckJob", () => {
  beforeEach(() => {
    openAlert.mockReset()
    closeAlert.mockReset()
    openAlert.mockResolvedValue({ created: true })
    closeAlert.mockResolvedValue({ closed: true })
  })

  it("skips when BLOCKLISTS is empty", async () => {
    const result = await processBlocklistCheckJob(
      {},
      {
        db: { select: vi.fn(), insert: vi.fn() } as never,
        blocklists: [],
        now: NOW,
      }
    )
    expect(result).toEqual({
      lists: 0,
      targets: 0,
      checks: 0,
      listed: 0,
      errors: 0,
      alerts_opened: 0,
      alerts_closed: 0,
    })
  })

  it("opens a critical alert when a listed test IP is found", async () => {
    const { insert, values } = insertChain()
    const select = vi.fn(() => selectChain([]))
    const lookup = vi.fn(async (queryName: string) => {
      if (queryName === "2.0.0.127.zen.spamhaus.org") {
        return { kind: "found" as const, values: ["127.0.0.2"] }
      }
      return { kind: "not_found" as const }
    })

    const result = await processBlocklistCheckJob(
      { request_id: "req-bl-1" },
      {
        db: { select, insert } as never,
        blocklists: ["zen.spamhaus.org"],
        checkIps: ["127.0.0.2"],
        resolveDomainIps: async () => [],
        lookup,
        now: NOW,
      }
    )

    expect(result).toMatchObject({
      lists: 1,
      targets: 1,
      checks: 1,
      listed: 1,
      errors: 0,
      alerts_opened: 1,
      alerts_closed: 0,
    })
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "ip",
        target: "127.0.0.2",
        listName: "zen.spamhaus.org",
        listed: true,
        checkedAt: NOW,
        error: null,
      })
    )
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: BLOCKLIST_LISTED_ALERT_TYPE,
        severity: "critical",
        dedupeKey: "blocklist:127.0.0.2:zen.spamhaus.org",
        payload: expect.objectContaining({
          target: "127.0.0.2",
          target_type: "ip",
          list_name: "zen.spamhaus.org",
        }),
      })
    )
    expect(closeAlert).not.toHaveBeenCalled()
  })

  it("closes the alert when a previously listed target is clean", async () => {
    const { insert } = insertChain()
    const select = vi.fn(() => selectChain([{ name: "send.example.com" }]))

    const result = await processBlocklistCheckJob(
      {},
      {
        db: { select, insert } as never,
        blocklists: ["zen.spamhaus.org"],
        checkIps: [],
        resolveDomainIps: async () => [],
        lookup: async () => ({ kind: "not_found" }),
        now: NOW,
      }
    )

    expect(result).toMatchObject({
      targets: 1,
      checks: 1,
      listed: 0,
      alerts_closed: 1,
    })
    expect(closeAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: BLOCKLIST_LISTED_ALERT_TYPE,
        dedupeKey: "blocklist:send.example.com:zen.spamhaus.org",
      })
    )
    expect(openAlert).not.toHaveBeenCalled()
  })

  it("records errors without opening or closing alerts", async () => {
    const { insert, values } = insertChain()
    const select = vi.fn(() => selectChain([]))

    const result = await processBlocklistCheckJob(
      {},
      {
        db: { select, insert } as never,
        blocklists: ["zen.spamhaus.org"],
        checkIps: ["203.0.113.10"],
        resolveDomainIps: async () => [],
        lookup: async () => {
          throw new Error("DNSBL lookup timed out after 5000ms")
        },
        now: NOW,
      }
    )

    expect(result).toMatchObject({
      checks: 1,
      listed: 0,
      errors: 1,
      alerts_opened: 0,
      alerts_closed: 0,
    })
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        listed: null,
        error: "DNSBL lookup timed out after 5000ms",
      })
    )
    expect(openAlert).not.toHaveBeenCalled()
    expect(closeAlert).not.toHaveBeenCalled()
  })

  it("does not open alerts for DNSBL policy responses", async () => {
    const { insert, values } = insertChain()
    const select = vi.fn(() => selectChain([]))

    const result = await processBlocklistCheckJob(
      {},
      {
        db: { select, insert } as never,
        blocklists: ["zen.spamhaus.org"],
        checkIps: ["127.0.0.2"],
        resolveDomainIps: async () => [],
        lookup: async () => ({
          kind: "found",
          values: ["127.255.255.254"],
        }),
        now: NOW,
      }
    )

    expect(result).toMatchObject({
      checks: 1,
      listed: 0,
      errors: 1,
      alerts_opened: 0,
      alerts_closed: 0,
    })
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        listed: null,
        error: "DNSBL policy/error response: 127.255.255.254",
      })
    )
    expect(openAlert).not.toHaveBeenCalled()
  })

  it("includes resolved domain A records as IP targets", async () => {
    const { insert } = insertChain()
    const select = vi.fn(() => selectChain([{ name: "send.example.com" }]))
    const seenQueries: string[] = []

    await processBlocklistCheckJob(
      {},
      {
        db: { select, insert } as never,
        blocklists: ["zen.spamhaus.org"],
        checkIps: [],
        resolveDomainIps: async () => ["203.0.113.50"],
        lookup: async (queryName) => {
          seenQueries.push(queryName)
          return { kind: "not_found" }
        },
        now: NOW,
      }
    )

    expect(seenQueries).toEqual(
      expect.arrayContaining([
        "send.example.com.zen.spamhaus.org",
        "50.113.0.203.zen.spamhaus.org",
      ])
    )
  })
})
