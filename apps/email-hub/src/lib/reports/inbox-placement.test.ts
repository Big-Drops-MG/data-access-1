import { describe, expect, it } from "vitest"

import {
  summarizeBlocklists,
  summarizeLatestSends,
  summarizePlacement,
  type BlocklistSeedRow,
  type InboxSeedRow,
} from "./inbox-placement"

function seed(overrides: Partial<InboxSeedRow> = {}): InboxSeedRow {
  return {
    provider: "gmail",
    placement: "inbox",
    checkedAt: new Date("2026-11-08T23:50:00.000Z"),
    messageId: "019a0000-0000-7000-8000-000000000001",
    sendId: "019a0000-0000-7000-8000-000000000010",
    templateName: "Engagement - October update v3",
    sendName: "October",
    sentAt: new Date("2026-11-08T23:50:00.000Z"),
    ...overrides,
  }
}

describe("summarizePlacement", () => {
  it("counts inbox, promotions, and spam for the last window", () => {
    const rows = summarizePlacement([
      seed({ provider: "Gmail", placement: "inbox" }),
      seed({ provider: "google", placement: "spam" }),
      seed({ provider: "Yahoo Mail", placement: "promotions" }),
      seed({ provider: "icloud", placement: "missing" }),
    ])

    const gmail = rows.find((row) => row.provider === "gmail")
    const yahoo = rows.find((row) => row.provider === "yahoo")
    const icloud = rows.find((row) => row.provider === "icloud")
    expect(gmail).toMatchObject({ inbox: 1, promotions: 0, spam: 1 })
    expect(yahoo).toMatchObject({ inbox: 0, promotions: 1, spam: 0 })
    expect(icloud).toMatchObject({ inbox: 0, spam: 0 })
    expect(gmail?.confidence_label).toBe("Provider reported")
    expect(icloud?.confidence_tone).toBe("warn")
    expect(rows.map((row) => row.provider).slice(0, 5)).toEqual([
      "gmail",
      "yahoo",
      "outlook",
      "aol",
      "icloud",
    ])
  })
})

describe("summarizeLatestSends", () => {
  it("keeps the latest placement per provider on one send", () => {
    const rows = summarizeLatestSends([
      seed({
        provider: "gmail",
        placement: "spam",
        checkedAt: new Date("2026-11-08T12:00:00.000Z"),
      }),
      seed({
        provider: "gmail",
        placement: "inbox",
        checkedAt: new Date("2026-11-08T18:00:00.000Z"),
      }),
      seed({
        provider: "yahoo",
        placement: "inbox",
        messageId: "019a0000-0000-7000-8000-000000000002",
      }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: "019a0000-0000-7000-8000-000000000010",
      template: "Engagement - October update v3",
      placements: { gmail: "inbox", yahoo: "inbox" },
    })
  })
})

describe("summarizeBlocklists", () => {
  it("keeps the newest Spamhaus and Barracuda result per IP", () => {
    const rows: BlocklistSeedRow[] = [
      {
        target: "203.0.113.10",
        listName: "zen.spamhaus.org",
        listed: true,
        checkedAt: new Date("2026-11-08T12:00:00.000Z"),
      },
      {
        target: "203.0.113.10",
        listName: "zen.spamhaus.org",
        listed: false,
        checkedAt: new Date("2026-11-08T18:00:00.000Z"),
      },
      {
        target: "203.0.113.10",
        listName: "b.barracudacentral.org",
        listed: null,
        checkedAt: new Date("2026-11-08T18:00:00.000Z"),
      },
      {
        target: "203.0.113.11",
        listName: "other.example",
        listed: true,
        checkedAt: new Date("2026-11-08T18:00:00.000Z"),
      },
    ]

    expect(summarizeBlocklists(rows)).toEqual([
      {
        target: "203.0.113.10",
        spamhaus: "clean",
        barracuda: "unknown",
        checked_at: "2026-11-08T18:00:00.000Z",
      },
    ])
  })
})
