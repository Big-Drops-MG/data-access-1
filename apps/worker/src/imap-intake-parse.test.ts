import { describe, expect, it } from "vitest"

import {
  buildArfMessage,
  buildDsnMessage,
  buildUnrelatedMessage,
} from "./imap-intake-fixtures.js"
import { contentHashFor, parseIntakeMail } from "./imap-intake-parse.js"

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

  it("returns null for unrelated mail", async () => {
    const parsed = await parseIntakeMail(
      buildUnrelatedMessage("plain@example.com")
    )
    expect(parsed).toBeNull()
  })
})
