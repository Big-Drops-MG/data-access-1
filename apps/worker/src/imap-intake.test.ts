import { beforeEach, describe, expect, it, vi } from "vitest"

const info = vi.hoisted(() => vi.fn())

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({ info, warn: vi.fn(), error: vi.fn() }),
}))

import {
  buildArfMessage,
  buildDsnMessage,
  buildUnrelatedMessage,
} from "./imap-intake-fixtures.js"
import { processImapIntakeJob } from "./imap-intake.js"
import { FakeImapServer } from "./imap-mailbox.js"

const messageId = "019a0000-0000-7000-8000-0000000000m1"
const recipientId = "019a0000-0000-7000-8000-0000000000r1"
const sesMessageId = "0100019a@email.amazonses.com"
const feedbackId = "019a0000-0000-7000-8000-0000000000f1"
const reportId = "019a0000-0000-7000-8000-0000000000p1"

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of [
    "select",
    "from",
    "where",
    "limit",
    "innerJoin",
    "insert",
    "values",
    "returning",
    "onConflictDoNothing",
  ]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe("processImapIntakeJob with FakeImapServer", () => {
  beforeEach(() => {
    info.mockReset()
  })

  it("skips when IMAP is not configured", async () => {
    const result = await processImapIntakeJob({ env: {} })
    expect(result).toEqual({
      fetched: 0,
      processed: 0,
      skipped: 0,
      reports: 0,
      feedbackItems: 0,
    })
  })

  it("processes ARF: stores report, creates feedback when SES id matches, moves to Processed", async () => {
    const server = new FakeImapServer()
    server.seedUnseen(
      buildArfMessage({
        reportMessageId: "arf-1@outlook.com",
        originalMessageId: sesMessageId,
        recipientEmail: "ada@example.com",
      })
    )

    let selectCalls = 0
    const db = {
      select: vi.fn(() => {
        selectCalls += 1
        if (selectCalls === 1) {
          return query([{ messageId, recipientId }])
        }
        return query([])
      }),
      insert: vi.fn((table: { [key: string]: unknown }) => {
        const name = String(table)
        void name
        return {
          values: vi.fn(() => ({
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn(async () => {
                // feedback insert first, then provider_report
                return [{ id: feedbackId }]
              }),
            })),
          })),
        }
      }),
    }

    // Distinguish feedback vs provider_report inserts by call order
    let insertCalls = 0
    db.insert = vi.fn(() => {
      insertCalls += 1
      const id = insertCalls === 1 ? feedbackId : reportId
      return {
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [{ id }]),
          })),
        })),
      }
    })

    const result = await processImapIntakeJob({
      mailbox: server,
      db: db as never,
    })

    expect(result).toMatchObject({
      fetched: 1,
      processed: 1,
      skipped: 0,
      reports: 1,
      feedbackItems: 1,
    })
    expect(server.inboxUids()).toEqual([])
    expect(server.processedUids()).toEqual([1])
    expect(db.insert).toHaveBeenCalledTimes(2)
  })

  it("processes DSN: stores report and moves to Processed when matched", async () => {
    const server = new FakeImapServer()
    server.seedUnseen(
      buildDsnMessage({
        reportMessageId: "dsn-1@mx.example.com",
        originalMessageId: sesMessageId,
        recipientEmail: "bob@example.com",
      })
    )

    const db = {
      select: vi.fn(() => query([{ messageId, recipientId }])),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: reportId }]),
          })),
        })),
      })),
    }

    let insertCalls = 0
    db.insert = vi.fn(() => {
      insertCalls += 1
      return {
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [
              { id: insertCalls === 1 ? feedbackId : reportId },
            ]),
          })),
        })),
      }
    })

    const result = await processImapIntakeJob({
      mailbox: server,
      db: db as never,
    })

    expect(result.processed).toBe(1)
    expect(result.reports).toBe(1)
    expect(result.feedbackItems).toBe(1)
    expect(server.processedUids()).toEqual([1])
  })

  it("leaves unrelated mail in the inbox", async () => {
    const server = new FakeImapServer()
    server.seedUnseen(buildUnrelatedMessage("plain-1@example.com"))

    const db = {
      select: vi.fn(() => query([])),
      insert: vi.fn(),
    }

    const result = await processImapIntakeJob({
      mailbox: server,
      db: db as never,
    })

    expect(result).toMatchObject({
      fetched: 1,
      processed: 0,
      skipped: 1,
      reports: 0,
      feedbackItems: 0,
    })
    expect(server.inboxUids()).toEqual([1])
    expect(server.processedUids()).toEqual([])
    expect(db.insert).not.toHaveBeenCalled()
  })

  it("stores unmatched ARF without feedback_item and still moves to Processed", async () => {
    const server = new FakeImapServer()
    server.seedUnseen(
      buildArfMessage({
        reportMessageId: "arf-unmatched@outlook.com",
        originalMessageId: "unknown@email.amazonses.com",
        recipientEmail: "nobody@example.com",
      })
    )

    const db = {
      select: vi.fn(() => query([])),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: reportId }]),
          })),
        })),
      })),
    }

    const result = await processImapIntakeJob({
      mailbox: server,
      db: db as never,
    })

    expect(result).toMatchObject({
      processed: 1,
      reports: 1,
      feedbackItems: 0,
    })
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(server.processedUids()).toEqual([1])
  })

  it("matches by recipient email when SES id is unknown (no feedback item)", async () => {
    const server = new FakeImapServer()
    server.seedUnseen(
      buildArfMessage({
        reportMessageId: "arf-rcpt@outlook.com",
        originalMessageId: "unknown@email.amazonses.com",
        recipientEmail: "ada@example.com",
      })
    )

    const db = {
      select: vi.fn((fields: Record<string, unknown>) => {
        // Recipient lookup selects only recipientId; message match selects both.
        if ("recipientId" in fields && !("messageId" in fields)) {
          return query([{ recipientId }])
        }
        return query([])
      }),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: reportId }]),
          })),
        })),
      })),
    }

    const result = await processImapIntakeJob({
      mailbox: server,
      db: db as never,
    })

    expect(result).toMatchObject({
      processed: 1,
      reports: 1,
      feedbackItems: 0,
    })
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it("reuses existing feedback on dedupe conflict and skips duplicate report", async () => {
    const server = new FakeImapServer()
    server.seedUnseen(
      buildArfMessage({
        reportMessageId: "arf-dup@outlook.com",
        originalMessageId: sesMessageId,
        recipientEmail: "ada@example.com",
      })
    )

    let insertCalls = 0
    const db = {
      select: vi.fn(() => {
        // first: message match; later: existing feedback lookup
        return query([{ messageId, recipientId, id: feedbackId }])
      }),
      insert: vi.fn(() => {
        insertCalls += 1
        return {
          values: vi.fn(() => ({
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn(async () => {
                // feedback conflict then report conflict
                return []
              }),
            })),
          })),
        }
      }),
    }

    const result = await processImapIntakeJob({
      mailbox: server,
      db: db as never,
    })

    expect(result).toMatchObject({
      processed: 1,
      reports: 0,
      feedbackItems: 1,
    })
    expect(insertCalls).toBe(2)
    expect(server.processedUids()).toEqual([1])
  })

  it("skips when IMAP env is only partially configured", async () => {
    const result = await processImapIntakeJob({
      env: { IMAP_HOST: "imap.example.com", IMAP_USER: "u" },
    })
    expect(result.fetched).toBe(0)
  })
})
