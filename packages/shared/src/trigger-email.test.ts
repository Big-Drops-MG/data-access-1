import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Message, Recipient } from "@workspace/db"

import type { AppError } from "./errors.js"
import {
  findOrCreateRecipient,
  lockRecipientTx,
  triggerEmail,
  type EmailHubDb,
  type EmailHubTx,
} from "./trigger-email.js"

const recipientRow = {
  id: "01900000-0000-7000-8000-000000000001",
  email: "jane@example.com",
  emailHash: "abc",
  externalUserId: null,
  tier: "standard",
  tierUpdatedAt: new Date(),
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastEmailedAt: null,
} as Recipient

const messageRow = {
  id: "01900000-0000-7000-8000-000000000002",
  sendId: null,
  recipientId: recipientRow.id,
  offerId: null,
  emailType: "thank_you",
  templateVersionId: "01900000-0000-7000-8000-000000000003",
  senderId: "01900000-0000-7000-8000-000000000004",
  idempotencyKey: "key-1",
  status: "queued",
  skipReason: null,
  failureReason: null,
  sesMessageId: null,
  queuedAt: new Date(),
  sentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Message

type SelectResult = Recipient[] | Message[]

function createChain(result: SelectResult) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => result),
    values: vi.fn(() => chain),
    returning: vi.fn(async () => result),
  }
  return chain
}

describe("findOrCreateRecipient", () => {
  it("rejects an invalid email", async () => {
    const db = {
      select: vi.fn(),
      insert: vi.fn(),
    } as unknown as EmailHubDb

    await expect(
      findOrCreateRecipient(db, "not-an-email")
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 422,
    } satisfies Partial<AppError>)
    expect(db.select).not.toHaveBeenCalled()
  })

  it("returns an existing recipient", async () => {
    const selectChain = createChain([recipientRow])
    const db = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(),
    } as unknown as EmailHubDb

    await expect(
      findOrCreateRecipient(db, "  Jane@Example.COM ")
    ).resolves.toBe(recipientRow)
    expect(db.insert).not.toHaveBeenCalled()
  })

  it("inserts when no recipient exists", async () => {
    const selectChain = createChain([])
    const insertChain = createChain([recipientRow])
    const db = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    } as unknown as EmailHubDb

    await expect(
      findOrCreateRecipient(db, "jane@example.com", "ext-1")
    ).resolves.toBe(recipientRow)
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@example.com",
        externalUserId: "ext-1",
        emailHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    )
  })

  it("rethrows non-unique insert errors", async () => {
    const selectChain = createChain([])
    const insertChain = createChain([])
    insertChain.returning = vi.fn(async () => {
      throw new Error("connection lost")
    })
    const db = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    } as unknown as EmailHubDb

    await expect(findOrCreateRecipient(db, "jane@example.com")).rejects.toThrow(
      "connection lost"
    )
  })

  it("reselects after a unique-violation race", async () => {
    const select = vi
      .fn()
      .mockImplementationOnce(() => createChain([]))
      .mockImplementationOnce(() => createChain([recipientRow]))
    const insertChain = createChain([])
    insertChain.returning = vi.fn(async () => {
      throw Object.assign(new Error("duplicate"), { code: "23505" })
    })
    const db = {
      select,
      insert: vi.fn(() => insertChain),
    } as unknown as EmailHubDb

    await expect(findOrCreateRecipient(db, "jane@example.com")).resolves.toBe(
      recipientRow
    )
    expect(select).toHaveBeenCalledTimes(2)
  })

  it("throws internal when insert returns no row", async () => {
    const selectChain = createChain([])
    const insertChain = createChain([])
    const db = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    } as unknown as EmailHubDb

    await expect(
      findOrCreateRecipient(db, "jane@example.com")
    ).rejects.toMatchObject({ code: "internal" } satisfies Partial<AppError>)
  })

  it("throws internal when unique race reselect finds nothing", async () => {
    const select = vi
      .fn()
      .mockImplementationOnce(() => createChain([]))
      .mockImplementationOnce(() => createChain([]))
    const insertChain = createChain([])
    insertChain.returning = vi.fn(async () => {
      throw Object.assign(new Error("duplicate"), { code: "23505" })
    })
    const db = {
      select,
      insert: vi.fn(() => insertChain),
    } as unknown as EmailHubDb

    await expect(
      findOrCreateRecipient(db, "jane@example.com")
    ).rejects.toMatchObject({ code: "internal" } satisfies Partial<AppError>)
  })
})

describe("lockRecipientTx", () => {
  it("runs pg_advisory_xact_lock for the recipient id", async () => {
    const execute = vi.fn(async () => undefined)
    const tx = { execute } as unknown as EmailHubTx

    await lockRecipientTx(tx, recipientRow.id)

    expect(execute).toHaveBeenCalledTimes(1)
  })
})

describe("triggerEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("rejects an empty idempotency key before touching the database", async () => {
    const db = {
      select: vi.fn(),
      transaction: async () => {
        throw new Error("should not open a transaction")
      },
    } as unknown as EmailHubDb

    await expect(
      triggerEmail(
        db,
        { email: "a@example.com", idempotencyKey: "   " },
        async () => {
          throw new Error("should not create")
        }
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 422,
    } satisfies Partial<AppError>)
    expect(db.select).not.toHaveBeenCalled()
  })

  it("returns an existing message for a used idempotency key", async () => {
    const selectRecipient = createChain([recipientRow])
    const selectMessage = createChain([messageRow])
    const execute = vi.fn(async () => undefined)
    const tx = {
      execute,
      select: vi.fn(() => selectMessage),
    } as unknown as EmailHubTx

    const db = {
      select: vi.fn(() => selectRecipient),
      insert: vi.fn(),
      transaction: vi.fn(async (fn: (tx: EmailHubTx) => Promise<unknown>) =>
        fn(tx)
      ),
    } as unknown as EmailHubDb

    const createMessage = vi.fn(async () => {
      throw new Error("should not create")
    })

    const result = await triggerEmail(
      db,
      { email: "jane@example.com", idempotencyKey: "key-1" },
      createMessage
    )

    expect(result).toEqual({
      message: messageRow,
      recipient: recipientRow,
      created: false,
    })
    expect(createMessage).not.toHaveBeenCalled()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("calls createMessage when the idempotency key is new", async () => {
    const selectRecipient = createChain([recipientRow])
    const selectMessage = createChain([])
    const execute = vi.fn(async () => undefined)
    const tx = {
      execute,
      select: vi.fn(() => selectMessage),
    } as unknown as EmailHubTx

    const db = {
      select: vi.fn(() => selectRecipient),
      insert: vi.fn(),
      transaction: vi.fn(async (fn: (tx: EmailHubTx) => Promise<unknown>) =>
        fn(tx)
      ),
    } as unknown as EmailHubDb

    const created = {
      ...messageRow,
      id: "01900000-0000-7000-8000-000000000099",
    }
    const createMessage = vi.fn(async () => created)

    const result = await triggerEmail(
      db,
      {
        email: "jane@example.com",
        idempotencyKey: " key-new ",
        externalUserId: "ext-9",
      },
      createMessage
    )

    expect(result.created).toBe(true)
    expect(result.message).toBe(created)
    expect(createMessage).toHaveBeenCalledWith({
      tx,
      recipient: recipientRow,
      idempotencyKey: "key-new",
      email: recipientRow.email,
      externalUserId: "ext-9",
    })
  })
})
