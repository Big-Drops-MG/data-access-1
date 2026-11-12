import { describe, expect, it } from "vitest"

import {
  buildArfMessage,
  buildDsnMessage,
  buildUnrelatedMessage,
} from "./imap-intake-fixtures.js"
import {
  contentHashFor,
  feedbackDedupeHashForReport,
  parseIntakeMail,
} from "./imap-intake-parse.js"

describe("parseIntakeMail", () => {
  it("parses an ARF feedback report", async () => {
    const raw = buildArfMessage({
      reportMessageId: "arf-report@outlook.com",
      originalMessageId: "0100019a@email.amazonses.com",
      recipientEmail: "ada@example.com",
    })
    const parsed = await parseIntakeMail(raw)
    expect(parsed).toMatchObject({
      kind: "arf",
      provider: "jmrp",
      feedbackType: "abuse",
      reportMessageId: "arf-report@outlook.com",
      contentHash: contentHashFor("arf-report@outlook.com"),
    })
    expect(parsed?.originalMessageIds).toContain("0100019a@email.amazonses.com")
    expect(parsed?.recipientEmails).toContain("ada@example.com")
    expect(parsed?.sesMessageIds.length).toBeGreaterThan(0)
  })

  it("detects yahoo provider from from-address / user-agent", async () => {
    const raw = buildArfMessage({
      reportMessageId: "arf-yahoo@yahoo.com",
      originalMessageId: "0100019a@email.amazonses.com",
      recipientEmail: "ada@example.com",
      from: "noreply@yahoo.com",
      userAgent: "Yahoo! Mail Feedback Loop",
    })
    const parsed = await parseIntakeMail(raw)
    expect(parsed?.provider).toBe("yahoo")
  })

  it("hashes content when Message-ID is missing", async () => {
    const raw = buildArfMessage({
      originalMessageId: "0100019a@email.amazonses.com",
      recipientEmail: "ada@example.com",
    })
    const parsed = await parseIntakeMail(Buffer.from(raw, "utf8"))
    expect(parsed?.kind).toBe("arf")
    expect(parsed?.reportMessageId).toBe(contentHashFor(raw))
  })

  it("parses a DSN delivery-status report", async () => {
    const raw = buildDsnMessage({
      reportMessageId: "dsn-report@mx.example.com",
      originalMessageId: "0100019b@email.amazonses.com",
      recipientEmail: "bob@example.com",
    })
    const parsed = await parseIntakeMail(raw)
    expect(parsed).toMatchObject({
      kind: "dsn",
      action: "failed",
      reportMessageId: "dsn-report@mx.example.com",
    })
    expect(parsed?.originalMessageIds).toContain("0100019b@email.amazonses.com")
    expect(parsed?.recipientEmails).toContain("bob@example.com")
  })

  it("collects SES ids from original rfc822 when DSN omits Original-Message-ID", async () => {
    const raw = buildDsnMessage({
      reportMessageId: "dsn-ses@mx.example.com",
      originalMessageId: "0100019c@email.amazonses.com",
      recipientEmail: "casey@example.com",
      includeOriginalMessageIdInDsn: false,
      includeSesHeader: true,
    })
    const parsed = await parseIntakeMail(raw)
    expect(parsed?.kind).toBe("dsn")
    expect(parsed?.originalMessageIds).toContain("0100019c@email.amazonses.com")
    expect(parsed?.sesMessageIds).toEqual(
      expect.arrayContaining(["0100019c@email.amazonses.com", "0100019c"])
    )
  })

  it("returns null for unrelated mail", async () => {
    const parsed = await parseIntakeMail(
      buildUnrelatedMessage("plain@example.com")
    )
    expect(parsed).toBeNull()
  })

  it("builds a stable feedback dedupe hash", () => {
    const hash = feedbackDedupeHashForReport("abc", "arf")
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(feedbackDedupeHashForReport("abc", "arf")).toBe(hash)
    expect(feedbackDedupeHashForReport("abc", "dsn")).not.toBe(hash)
  })
})
