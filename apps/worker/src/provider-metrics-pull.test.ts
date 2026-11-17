import { beforeEach, describe, expect, it, vi } from "vitest"
import { UnrecoverableError } from "bullmq"

const openAlert = vi.hoisted(() => vi.fn())
const closeAlert = vi.hoisted(() => vi.fn())
const recordIntegrationResult = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    openAlert,
    closeAlert,
    recordIntegrationResult,
  }
})

import {
  PROVIDER_CREDENTIALS_INVALID_ALERT_TYPE,
  dayFromActivityPeriod,
  etDateDaysAgo,
  parseComplaintRate,
  parseCsv,
  providerCredsAlertDedupeKey,
  readPostmasterCredentials,
  reputationToValue,
  resolveSndsDataUrl,
  resolveSndsIpStatusUrl,
  sndsCsvToMetricRows,
  sndsFilterResultToValue,
  sndsIpStatusCsvToMetricRows,
  toPostmasterDateId,
  trafficStatsToMetricRows,
  processProviderMetricsPull,
} from "./provider-metrics-pull.js"

function createSelectDb(responses: unknown[]) {
  let index = 0
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const current = responses[index++] ?? []
          const promise = Promise.resolve(current)
          return Object.assign(promise, {
            groupBy: async () => current,
          })
        },
      }),
    }),
  }
}

beforeEach(() => {
  openAlert.mockReset()
  closeAlert.mockReset()
  recordIntegrationResult.mockReset()
  openAlert.mockResolvedValue({ created: true, alert: {} })
  closeAlert.mockResolvedValue({ closed: true, alert: {} })
  recordIntegrationResult.mockResolvedValue({})
})

describe("provider-metrics-pull helpers", () => {
  it("maps reputation and filter enums", () => {
    expect(reputationToValue(null)).toBeNull()
    expect(reputationToValue("HIGH")).toBe(4)
    expect(reputationToValue("MEDIUM")).toBe(3)
    expect(reputationToValue("LOW")).toBe(2)
    expect(reputationToValue("bad")).toBe(1)
    expect(reputationToValue("unknown")).toBeNull()
    expect(sndsFilterResultToValue(null)).toBeNull()
    expect(sndsFilterResultToValue("GREEN")).toBe(1)
    expect(sndsFilterResultToValue("dark green")).toBe(1)
    expect(sndsFilterResultToValue("0")).toBe(1)
    expect(sndsFilterResultToValue("YELLOW")).toBe(2)
    expect(sndsFilterResultToValue("RED")).toBe(3)
    expect(sndsFilterResultToValue("7")).toBe(7)
    expect(sndsFilterResultToValue("nope")).toBeNull()
  })

  it("parses complaint rates", () => {
    expect(parseComplaintRate(null)).toBeNull()
    expect(parseComplaintRate("")).toBeNull()
    expect(parseComplaintRate("-")).toBeNull()
    expect(parseComplaintRate("0.001")).toBe(0.001)
    expect(parseComplaintRate("1:500")).toBeCloseTo(0.002)
    expect(parseComplaintRate("1:0")).toBeNull()
    expect(parseComplaintRate("1.5%")).toBeCloseTo(0.015)
    expect(parseComplaintRate("n/a")).toBeNull()
    expect(parseComplaintRate("abc")).toBeNull()
  })

  it("requires all Postmaster credentials", () => {
    expect(readPostmasterCredentials({})).toBeNull()
    expect(
      readPostmasterCredentials({
        GOOGLE_POSTMASTER_CLIENT_ID: "id",
        GOOGLE_POSTMASTER_CLIENT_SECRET: "secret",
        GOOGLE_POSTMASTER_REFRESH_TOKEN: "token",
      })
    ).toEqual({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "token",
    })
  })

  it("resolves SNDS data and IP status URLs from key or full URL", () => {
    expect(resolveSndsDataUrl({})).toBeNull()
    expect(resolveSndsIpStatusUrl({})).toBeNull()
    expect(resolveSndsDataUrl({ SNDS_KEY: "abc" })).toContain("key=abc")
    expect(resolveSndsIpStatusUrl({ SNDS_KEY: "abc" })).toContain(
      "ipStatus.aspx"
    )
    expect(
      resolveSndsDataUrl({
        SNDS_DATA_URL: "https://example.com/snds.csv",
        SNDS_KEY: "ignored",
      })
    ).toBe("https://example.com/snds.csv")
    expect(
      resolveSndsIpStatusUrl({
        SNDS_IP_STATUS_URL: "https://example.com/status.csv",
        SNDS_KEY: "ignored",
      })
    ).toBe("https://example.com/status.csv")
    expect(
      resolveSndsIpStatusUrl({
        SNDS_DATA_URL: "https://example.com/snds.csv",
      })
    ).toBeNull()
  })

  it("formats ET date ids and activity periods", () => {
    const day = etDateDaysAgo(0, new Date("2026-11-17T15:00:00.000Z"))
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(toPostmasterDateId("2026-11-15")).toBe("20261115")
    expect(dayFromActivityPeriod(undefined, "2026-01-01")).toBe("2026-01-01")
    expect(dayFromActivityPeriod("no-date-here", "2026-01-01")).toBe(
      "2026-01-01"
    )
    expect(dayFromActivityPeriod("11/15/2026 12:00 AM - …", "2026-01-01")).toBe(
      "2026-11-15"
    )
  })

  it("parses CSV and builds SNDS metric rows", () => {
    const csv = [
      "IP Address,Activity Period,Filter Result,Complaint Rate,Trap Hits",
      '203.0.113.10,"11/15/2026 12:00 AM - 11/15/2026 11:59 PM",GREEN,1:1000,2',
      "198.51.100.20,11/15/2026,YELLOW,0.01,0",
      ",11/15/2026,RED,n/a,1",
    ].join("\n")
    expect(parseCsv(csv)).toHaveLength(4)
    expect(
      sndsCsvToMetricRows({
        csvText: "IP Address\n",
        fallbackDay: "2026-11-14",
        sourceReportId: "00000000-0000-4000-8000-000000000001",
        version: 1,
      })
    ).toEqual([])
    expect(
      sndsCsvToMetricRows({
        csvText: "Nope\n1",
        fallbackDay: "2026-11-14",
        sourceReportId: "00000000-0000-4000-8000-000000000001",
        version: 1,
      })
    ).toEqual([])
    const rows = sndsCsvToMetricRows({
      csvText: csv,
      fallbackDay: "2026-11-14",
      sourceReportId: "00000000-0000-4000-8000-000000000001",
      version: 1,
    })
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "snds",
          target: "203.0.113.10",
          metric: "complaint_rate",
        }),
        expect.objectContaining({
          target: "203.0.113.10",
          metric: "trap_hits",
          value: 2,
        }),
        expect.objectContaining({
          target: "203.0.113.10",
          metric: "filter_result",
          value: 1,
        }),
        expect.objectContaining({
          target: "198.51.100.20",
          metric: "filter_result",
          value: 2,
        }),
      ])
    )
  })

  it("builds IP status rows only for listed IPs", () => {
    expect(
      sndsIpStatusCsvToMetricRows({
        csvText: "",
        day: "2026-11-15",
        sourceReportId: "00000000-0000-4000-8000-000000000001",
        version: 1,
      })
    ).toEqual([])
    expect(
      sndsIpStatusCsvToMetricRows({
        csvText: [
          "IP Address,Status",
          "203.0.113.10,Blocked due to user complaints",
          "not-an-ip,Blocked",
        ].join("\n"),
        day: "2026-11-15",
        sourceReportId: "00000000-0000-4000-8000-000000000001",
        version: 1,
      })
    ).toEqual([
      expect.objectContaining({
        provider: "snds",
        target: "203.0.113.10",
        metric: "ip_status",
        value: 1,
        day: "2026-11-15",
      }),
    ])
    expect(
      sndsIpStatusCsvToMetricRows({
        csvText: '"198.51.100.20","Blocked"\n',
        day: "2026-11-15",
        sourceReportId: "00000000-0000-4000-8000-000000000001",
        version: 1,
      })
    ).toEqual([
      expect.objectContaining({
        target: "198.51.100.20",
        metric: "ip_status",
        value: 1,
      }),
    ])
  })

  it("maps trafficStats JSON to metric rows and skips empty stats", () => {
    expect(
      trafficStatsToMetricRows({
        domainName: "mail.example.com",
        day: "2026-11-15",
        sourceReportId: "00000000-0000-4000-8000-000000000001",
        version: 1,
        stats: {
          spamRatio: 0.012,
          domainReputation: "HIGH",
          ipReputations: [
            { reputation: "MEDIUM", ipCidrRange: "203.0.113.0/24" },
            { reputation: "BAD" },
          ],
        },
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "spam_rate", value: 0.012 }),
        expect.objectContaining({ metric: "domain_reputation", value: 4 }),
        expect.objectContaining({
          metric: "ip_reputation",
          target: "203.0.113.0/24",
          value: 3,
        }),
        expect.objectContaining({
          metric: "ip_reputation",
          target: "mail.example.com",
          value: 1,
        }),
      ])
    )
    expect(
      trafficStatsToMetricRows({
        domainName: "empty.example.com",
        day: "2026-11-15",
        sourceReportId: "00000000-0000-4000-8000-000000000001",
        version: 1,
        stats: {},
      })
    ).toEqual([])
  })
})

describe("processProviderMetricsPull", () => {
  it("skips Google and SNDS without credentials and inserts nothing when no FBL", async () => {
    const inserted: unknown[] = []
    const result = await processProviderMetricsPull({
      db: createSelectDb([[], [], []]) as never,
      env: {},
      insertRows: async (rows) => {
        inserted.push(...rows)
      },
    })
    expect(result.google.skipped).toBe(true)
    expect(result.snds.skipped).toBe(true)
    expect(result.rows).toBe(0)
    expect(inserted).toEqual([])
    expect(openAlert).not.toHaveBeenCalled()
  })

  it("pulls Google, SNDS data + IP status, and hub FBL aggregates", async () => {
    const inserted: unknown[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access" }), {
          status: 200,
        })
      }
      if (url.includes("gmailpostmastertools.googleapis.com")) {
        return new Response(
          JSON.stringify({
            spamRatio: 0.02,
            domainReputation: "MEDIUM",
            ipReputations: [
              { reputation: "HIGH", ipCidrRange: "203.0.113.8/32" },
            ],
          }),
          { status: 200 }
        )
      }
      if (url.includes("ipStatus.aspx")) {
        return new Response(
          "IP Address,Status\n203.0.113.10,Blocked due to complaints\n",
          { status: 200 }
        )
      }
      if (url.includes("snds") || url.includes("data.aspx")) {
        return new Response(
          [
            "IP Address,Activity Period,Filter Result,Complaint Rate,Trap Hits",
            "203.0.113.10,11/15/2026,GREEN,0.002,1",
          ].join("\n"),
          { status: 200 }
        )
      }
      return new Response("not found", { status: 404 })
    })

    const result = await processProviderMetricsPull({
      db: createSelectDb([
        [{ name: "mail.example.com" }],
        [{ count: 100 }],
        [
          { provider: "yahoo", count: 2 },
          { provider: "jmrp", count: 3 },
        ],
        [],
      ]) as never,
      env: {
        GOOGLE_POSTMASTER_CLIENT_ID: "id",
        GOOGLE_POSTMASTER_CLIENT_SECRET: "secret",
        GOOGLE_POSTMASTER_REFRESH_TOKEN: "refresh",
        SNDS_KEY: "snds-key",
      },
      fetchImpl,
      now: new Date("2026-11-17T15:00:00.000Z"),
      insertRows: async (rows) => {
        inserted.push(...rows)
      },
    })

    expect(result.google.skipped).toBe(false)
    expect(result.snds.skipped).toBe(false)
    expect(result.google.rows).toBeGreaterThan(0)
    expect(result.snds.rows).toBeGreaterThan(0)
    expect(result.yahoo.rows).toBe(1)
    expect(result.jmrp.rows).toBe(1)
    expect(inserted.length).toBe(result.rows)
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "google_postmaster",
          metric: "spam_rate",
        }),
        expect.objectContaining({
          provider: "snds",
          metric: "complaint_rate",
        }),
        expect.objectContaining({
          provider: "snds",
          metric: "ip_status",
          value: 1,
        }),
      ])
    )
    expect(fetchImpl).toHaveBeenCalled()
    expect(closeAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: PROVIDER_CREDENTIALS_INVALID_ALERT_TYPE,
        dedupeKey: providerCredsAlertDedupeKey("google_postmaster"),
      })
    )
    expect(closeAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: PROVIDER_CREDENTIALS_INVALID_ALERT_TYPE,
        dedupeKey: providerCredsAlertDedupeKey("snds"),
      })
    )
    expect(recordIntegrationResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "google_postmaster", ok: true })
    )
    expect(recordIntegrationResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "snds", ok: true })
    )
  })

  it("aggregates feedback_item yahoo/microsoft providers when sent is zero", async () => {
    const inserted: Array<{ provider: string; metric: string; value: number }> =
      []
    const result = await processProviderMetricsPull({
      db: createSelectDb([
        [{ count: 0 }],
        [],
        [
          { provider: "Yahoo", count: 2 },
          { provider: "microsoft", count: 1 },
          { provider: "outlook", count: 1 },
          { provider: null, count: 9 },
        ],
      ]) as never,
      env: {},
      now: new Date("2026-11-17T15:00:00.000Z"),
      insertRows: async (rows) => {
        inserted.push(
          ...rows.map((row) => ({
            provider: row.provider,
            metric: row.metric,
            value: row.value,
          }))
        )
      },
    })
    expect(result.yahoo.rows).toBe(1)
    expect(result.jmrp.rows).toBe(1)
    expect(inserted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "yahoo",
          metric: "complaint_rate",
          value: 2,
        }),
        expect.objectContaining({
          provider: "jmrp",
          metric: "junk_reports",
          value: 2,
        }),
      ])
    )
  })

  it("skips Postmaster days with 404 and continues other domains", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access" }), {
          status: 200,
        })
      }
      if (url.includes("missing.example.com")) {
        return new Response("missing", { status: 404 })
      }
      return new Response(
        JSON.stringify({ spamRatio: 0.01, domainReputation: "LOW" }),
        { status: 200 }
      )
    })
    const result = await processProviderMetricsPull({
      db: createSelectDb([
        [{ name: "missing.example.com" }, { name: "ok.example.com" }],
        [{ count: 0 }],
        [],
        [],
      ]) as never,
      env: {
        GOOGLE_POSTMASTER_CLIENT_ID: "id",
        GOOGLE_POSTMASTER_CLIENT_SECRET: "secret",
        GOOGLE_POSTMASTER_REFRESH_TOKEN: "refresh",
      },
      fetchImpl,
      now: new Date("2026-11-17T15:00:00.000Z"),
      insertRows: async () => undefined,
    })
    expect(result.google.domains).toBe(2)
    expect(result.google.rows).toBeGreaterThan(0)
  })

  it("returns early when credentials exist but no verified domains", async () => {
    const result = await processProviderMetricsPull({
      db: createSelectDb([[], [{ count: 0 }], [], []]) as never,
      env: {
        GOOGLE_POSTMASTER_CLIENT_ID: "id",
        GOOGLE_POSTMASTER_CLIENT_SECRET: "secret",
        GOOGLE_POSTMASTER_REFRESH_TOKEN: "refresh",
      },
      now: new Date("2026-11-17T15:00:00.000Z"),
      insertRows: async () => undefined,
    })
    expect(result.google).toEqual({ domains: 0, rows: 0, skipped: false })
  })

  it("opens provider_credentials_invalid and throws UnrecoverableError on Postmaster 4xx", async () => {
    await expect(
      processProviderMetricsPull({
        db: createSelectDb([[{ name: "mail.example.com" }]]) as never,
        env: {
          GOOGLE_POSTMASTER_CLIENT_ID: "id",
          GOOGLE_POSTMASTER_CLIENT_SECRET: "secret",
          GOOGLE_POSTMASTER_REFRESH_TOKEN: "refresh",
        },
        fetchImpl: async () => new Response("nope", { status: 401 }),
        now: new Date("2026-11-17T15:00:00.000Z"),
        insertRows: async () => undefined,
      })
    ).rejects.toBeInstanceOf(UnrecoverableError)

    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: PROVIDER_CREDENTIALS_INVALID_ALERT_TYPE,
        severity: "warning",
        dedupeKey: providerCredsAlertDedupeKey("google_postmaster"),
        payload: expect.objectContaining({
          provider: "google_postmaster",
          http_status: 401,
        }),
      })
    )
    expect(recordIntegrationResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "google_postmaster", ok: false })
    )
  })

  it("throws when Postmaster token response has no access_token", async () => {
    await expect(
      processProviderMetricsPull({
        db: createSelectDb([[{ name: "mail.example.com" }]]) as never,
        env: {
          GOOGLE_POSTMASTER_CLIENT_ID: "id",
          GOOGLE_POSTMASTER_CLIENT_SECRET: "secret",
          GOOGLE_POSTMASTER_REFRESH_TOKEN: "refresh",
        },
        fetchImpl: async () =>
          new Response(JSON.stringify({}), { status: 200 }),
        now: new Date("2026-11-17T15:00:00.000Z"),
        insertRows: async () => undefined,
      })
    ).rejects.toThrow(/no access_token/)
  })

  it("throws when Postmaster trafficStats returns a non-404 error", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access" }), {
          status: 200,
        })
      }
      return new Response("boom", { status: 500 })
    })
    await expect(
      processProviderMetricsPull({
        db: createSelectDb([[{ name: "mail.example.com" }]]) as never,
        env: {
          GOOGLE_POSTMASTER_CLIENT_ID: "id",
          GOOGLE_POSTMASTER_CLIENT_SECRET: "secret",
          GOOGLE_POSTMASTER_REFRESH_TOKEN: "refresh",
        },
        fetchImpl,
        now: new Date("2026-11-17T15:00:00.000Z"),
        insertRows: async () => undefined,
      })
    ).rejects.toThrow(/Postmaster trafficStats failed/)
  })

  it("opens provider_credentials_invalid on SNDS 4xx", async () => {
    await expect(
      processProviderMetricsPull({
        db: createSelectDb([]) as never,
        env: { SNDS_DATA_URL: "https://example.com/snds.csv" },
        fetchImpl: async () => new Response("nope", { status: 403 }),
        now: new Date("2026-11-17T15:00:00.000Z"),
        insertRows: async () => undefined,
      })
    ).rejects.toBeInstanceOf(UnrecoverableError)

    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: PROVIDER_CREDENTIALS_INVALID_ALERT_TYPE,
        dedupeKey: providerCredsAlertDedupeKey("snds"),
        payload: expect.objectContaining({
          provider: "snds",
          http_status: 403,
        }),
      })
    )
  })

  it("throws when SNDS data fetch fails with 5xx", async () => {
    await expect(
      processProviderMetricsPull({
        db: createSelectDb([]) as never,
        env: { SNDS_DATA_URL: "https://example.com/snds.csv" },
        fetchImpl: async () => new Response("nope", { status: 503 }),
        now: new Date("2026-11-17T15:00:00.000Z"),
        insertRows: async () => undefined,
      })
    ).rejects.toThrow(/SNDS data fetch failed/)
    expect(openAlert).not.toHaveBeenCalled()
    expect(recordIntegrationResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "snds", ok: false })
    )
  })
})
