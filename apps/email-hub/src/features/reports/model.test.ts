import { describe, expect, it } from "vitest"

import {
  buildEngagementView,
  buildProviderView,
  buildSendView,
  type EngagementRow,
  type ProviderMetricRow,
  type SendingRow,
} from "./model"

function sending(overrides: Partial<SendingRow> = {}): SendingRow {
  return {
    day: "2026-10-01",
    sending_domain: "mail.example.com",
    provider: "gmail",
    email_type: "newsletter",
    sent: 100,
    delivered: 90,
    bounce_hard: 4,
    bounce_soft: 1,
    complaint: 2,
    ...overrides,
  }
}

function engagement(overrides: Partial<EngagementRow> = {}): EngagementRow {
  return {
    day: "2026-10-01",
    sending_domain: "mail.example.com",
    provider: "gmail",
    email_type: "newsletter",
    opens: 40,
    unique_opens: 30,
    clicks: 10,
    unique_clicks: 8,
    unsubscribes: 1,
    ...overrides,
  }
}

describe("buildSendView", () => {
  it("rolls delivered and bounce rates up from sending and engagement rows", () => {
    const view = buildSendView({
      sending: [
        sending(),
        sending({
          day: "2026-10-02",
          sending_domain: "news.example.com",
          sent: 50,
          delivered: 40,
          bounce_hard: 0,
          bounce_soft: 2,
          complaint: 1,
          email_type: "digest",
        }),
      ],
      engagement: [
        engagement(),
        engagement({
          day: "2026-10-02",
          sending_domain: "news.example.com",
          opens: 5,
          clicks: 1,
          unsubscribes: 3,
        }),
      ],
      domain: null,
    })

    expect(view.kpis).toEqual({
      sent: 150,
      deliveredRate: 130 / 150,
      bouncedRate: 7 / 150,
      complaints: 3,
      unsubscribes: 4,
    })
    expect(view.daily).toEqual([
      { day: "2026-10-01", label: "Oct 1", delivered: 90, bounced: 5 },
      { day: "2026-10-02", label: "Oct 2", delivered: 40, bounced: 2 },
    ])
    expect(view.domains[0]).toMatchObject({
      label: "mail.example.com",
      opens: 40,
      unsubscribes: 1,
    })
  })

  it("filters to one sending domain", () => {
    const view = buildSendView({
      sending: [
        sending(),
        sending({ sending_domain: "other.example.com", sent: 5, delivered: 5 }),
      ],
      engagement: [],
      domain: "mail.example.com",
    })
    expect(view.kpis.sent).toBe(100)
    expect(view.domains).toHaveLength(1)
  })
})

describe("buildEngagementView", () => {
  it("builds client share, unsubscribe rate, and open-frequency buckets", () => {
    const view = buildEngagementView({
      sending: [sending({ delivered: 200 })],
      engagement: [engagement({ unsubscribes: 4 })],
      links: [{ link_url: "https://example.com/a", clicks: 9 }],
      environment: [
        {
          client: "Apple Mail",
          device_type: "iPhone",
          os: "iOS 18",
          country: "US",
          region: "Texas",
          opens: 30,
          clicks: 4,
          unsubscribes: 1,
        },
        {
          client: "Gmail",
          device_type: "desktop",
          os: "Windows",
          country: "US",
          region: "Ohio",
          opens: 10,
          clicks: 2,
          unsubscribes: 0,
        },
      ],
      frequency: [
        { bucket: "1", recipients: 12 },
        { bucket: "6", recipients: 2 },
        { bucket: "8+", recipients: 1 },
      ],
      domain: null,
    })

    expect(view.frequency.find((row) => row.bucket === "1")?.recipients).toBe(
      12
    )
    expect(view.frequency.find((row) => row.bucket === "8+")?.recipients).toBe(
      3
    )
    expect(view.clients[0]).toMatchObject({ label: "Apple Mail", share: 0.75 })
    expect(view.unsubscribes[0]).toMatchObject({
      label: "Newsletter",
      delivered: 200,
      unsubscribed: 4,
      rate: 0.02,
    })
    expect(view.devices[0]?.label).toBe("iPhone · iOS 18")
    expect(view.locations[0]?.label).toBe("Texas")
    expect(view.links[0]?.url).toBe("https://example.com/a")
  })
})

describe("buildProviderView", () => {
  it("charts spam rate for the selected domain and summarizes sources", () => {
    const rows: ProviderMetricRow[] = [
      {
        provider: "google_postmaster",
        target: "mail.example.com",
        metric: "spam_rate",
        day: "2026-10-01",
        value: 0.004,
      },
      {
        provider: "google_postmaster",
        target: "mail.example.com",
        metric: "spam_rate",
        day: "2026-10-02",
        value: 0.002,
      },
      {
        provider: "google_postmaster",
        target: "mail.example.com",
        metric: "domain_reputation",
        day: "2026-10-02",
        value: 4,
      },
      {
        provider: "google_postmaster",
        target: "203.0.113.10",
        metric: "ip_reputation",
        day: "2026-10-02",
        value: 3,
      },
      {
        provider: "jmrp",
        target: "mail.example.com",
        metric: "junk_reports",
        day: "2026-10-02",
        value: 4,
      },
    ]
    const view = buildProviderView(rows, null)
    expect(view.domains).toEqual(["mail.example.com"])
    expect(view.selectedDomain).toBe("mail.example.com")
    expect(view.spamSeries.map((row) => row.rate)).toEqual([0.004, 0.002])
    expect(view.postmaster[0]).toMatchObject({
      domain: "mail.example.com",
      reputation: "High",
      reputationTone: "ok",
      spamRate: 0.002,
      pulled: "Oct 2",
    })
    expect(
      view.sources.find((row) => row.source === "Google Postmaster")
    ).toMatchObject({
      summary: "Down 0.2 pts",
      healthy: true,
    })
    expect(
      view.sources.find((row) => row.source === "Microsoft JMRP")
    ).toMatchObject({
      summary: "4 reports",
    })
    expect(
      view.sources.find((row) => row.source === "Yahoo Sender Hub")
    ).toMatchObject({
      summary: "No reports",
      healthy: false,
    })
  })
})
