import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  EmailRoute,
  Message,
  Recipient,
  Sender,
  TemplateVersion,
} from "@workspace/db"

import { AppError } from "./errors.js"
import {
  assertMergeDataHasRequiredTags,
  findOrCreateRecipient,
  lockRecipientTx,
  noRouteAlertDedupeKey,
  requiredMergeTagNames,
  resolveEmailRoute,
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

const routeRow = {
  id: "01900000-0000-7000-8000-000000000010",
  emailType: "thank_you",
  offerId: null,
  templateId: "01900000-0000-7000-8000-000000000011",
  senderId: "01900000-0000-7000-8000-000000000004",
  status: "active",
  version: 1,
  createdBy: "01900000-0000-7000-8000-000000000099",
  createdAt: new Date(),
  updatedAt: new Date(),
} as EmailRoute

const versionRow = {
  id: "01900000-0000-7000-8000-000000000003",
  templateId: routeRow.templateId,
  versionNo: 1,
  subject: "Hi {{first_name}}",
  bodySource: "<p>Hi</p>",
  mergeTags: { first_name: "string", quote_url: "string" },
  createdBy: routeRow.createdBy,
  createdAt: new Date(),
} as TemplateVersion

const senderRow = {
  id: routeRow.senderId,
  domainId: "01900000-0000-7000-8000-000000000012",
  fromName: "Ops",
  fromEmail: "ops@example.com",
  replyTo: null,
  status: "active",
  version: 1,
  createdBy: routeRow.createdBy,
  createdAt: new Date(),
  updatedAt: new Date(),
  deactivatedAt: null,
} as Sender

const templateRow = {
  id: routeRow.templateId,
  name: "ty",
  emailType: "thank_you",
  categoryId: "01900000-0000-7000-8000-000000000013",
  currentVersionId: versionRow.id,
  status: "active",
  createdBy: routeRow.createdBy,
  createdAt: new Date(),
  updatedAt: new Date(),
}

type SelectResult = unknown[]

function createChain(result: SelectResult) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => result),
    values: vi.fn(() => chain),
    returning: vi.fn(async () => result),
    set: vi.fn(() => chain),
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

describe("requiredMergeTagNames / assertMergeDataHasRequiredTags", () => {
  it("reads tag names from an object or array", () => {
    expect(
      requiredMergeTagNames({ first_name: "string", x: "number" })
    ).toEqual(["first_name", "x"])
    expect(requiredMergeTagNames(["a", "b"])).toEqual(["a", "b"])
    expect(requiredMergeTagNames(null)).toEqual([])
  })

  it("passes when every required tag is present", () => {
    expect(() =>
      assertMergeDataHasRequiredTags(
        { first_name: "Jane", quote_url: "https://x" },
        { first_name: "string", quote_url: "string" }
      )
    ).not.toThrow()
  })

  it("throws 422 with merge_data.<tag> paths for missing tags", () => {
    let thrown: unknown
    try {
      assertMergeDataHasRequiredTags(
        { first_name: "Jane" },
        { first_name: "string", quote_url: "string" }
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({
      code: "validation_failed",
      status: 422,
      details: [{ path: "merge_data.quote_url", message: "Required" }],
    } satisfies Partial<AppError>)
  })

  it("rejects empty or whitespace-only string values", () => {
    expect(() =>
      assertMergeDataHasRequiredTags(
        { first_name: "", quote_url: "https://x" },
        { first_name: "string", quote_url: "string" }
      )
    ).toThrow(AppError)
    expect(() =>
      assertMergeDataHasRequiredTags(
        { first_name: "   ", quote_url: "https://x" },
        { first_name: "string", quote_url: "string" }
      )
    ).toThrow(AppError)
  })

  it("allows numeric zero and boolean false as present values", () => {
    expect(() =>
      assertMergeDataHasRequiredTags(
        { count: 0, opted_in: false },
        { count: "number", opted_in: "boolean" }
      )
    ).not.toThrow()
  })
})

describe("resolveEmailRoute", () => {
  it("prefers the offer-specific active route", async () => {
    const offerRoute = {
      ...routeRow,
      offerId: "01900000-0000-7000-8000-000000000020",
    }
    const selectChain = createChain([offerRoute])
    const db = {
      select: vi.fn(() => selectChain),
    } as unknown as EmailHubDb

    await expect(
      resolveEmailRoute(db, "thank_you", offerRoute.offerId)
    ).resolves.toBe(offerRoute)
  })

  it("falls back to the null-offer route when offer has none", async () => {
    const select = vi
      .fn()
      .mockImplementationOnce(() => createChain([]))
      .mockImplementationOnce(() => createChain([routeRow]))
    const db = { select } as unknown as EmailHubDb

    await expect(
      resolveEmailRoute(db, "thank_you", "01900000-0000-7000-8000-000000000020")
    ).resolves.toBe(routeRow)
    expect(select).toHaveBeenCalledTimes(2)
  })

  it("returns null when no active route exists", async () => {
    const select = vi.fn(() => createChain([]))
    const db = { select } as unknown as EmailHubDb

    await expect(resolveEmailRoute(db, "thank_you", null)).resolves.toBeNull()
  })
})

describe("noRouteAlertDedupeKey", () => {
  it("uses null token when offer is absent", () => {
    expect(noRouteAlertDedupeKey("thank_you", null)).toBe(
      "no_route:thank_you:null"
    )
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
        {
          email: "a@example.com",
          idempotencyKey: "   ",
          emailType: "thank_you",
        },
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
      {
        email: "jane@example.com",
        idempotencyKey: "key-1",
        emailType: "thank_you",
      },
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

  it("skips with no_route and opens an alert when no route exists", async () => {
    const selectRecipient = createChain([recipientRow])
    const selectMessage = createChain([])
    const selectNoRoute = createChain([])
    const skipped = {
      ...messageRow,
      id: "01900000-0000-7000-8000-000000000088",
      status: "skipped",
      skipReason: "no_route",
      templateVersionId: null,
      senderId: null,
    } as Message

    const execute = vi.fn(async () => undefined)
    const insertAlert = createChain([])
    const insertMessage = createChain([skipped])
    insertAlert.values = vi.fn(() => insertAlert)
    insertAlert.returning = vi.fn(async () => [])
    insertMessage.values = vi.fn(() => insertMessage)

    let selectCalls = 0
    const tx = {
      execute,
      select: vi.fn(() => {
        selectCalls += 1
        if (selectCalls === 1) {
          return selectMessage
        }
        return selectNoRoute
      }),
      insert: vi
        .fn()
        .mockImplementationOnce(() => insertAlert)
        .mockImplementationOnce(() => insertMessage),
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
      {
        email: "jane@example.com",
        idempotencyKey: "key-no-route",
        emailType: "thank_you",
        offerId: "01900000-0000-7000-8000-000000000020",
      },
      createMessage
    )

    expect(result.message).toBe(skipped)
    expect(result.created).toBe(true)
    expect(createMessage).not.toHaveBeenCalled()
    expect(insertAlert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "no_route",
        severity: "warning",
        dedupeKey: "no_route:thank_you:01900000-0000-7000-8000-000000000020",
      })
    )
    expect(insertMessage.values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        skipReason: "no_route",
        templateVersionId: null,
        senderId: null,
      })
    )
  })

  it("falls back to the default route and validates merge tags", async () => {
    const selectRecipient = createChain([recipientRow])
    const execute = vi.fn(async () => undefined)

    let selectCalls = 0
    const tx = {
      execute,
      select: vi.fn(() => {
        selectCalls += 1
        if (selectCalls === 1) {
          return createChain([])
        }
        if (selectCalls === 2) {
          return createChain([])
        }
        if (selectCalls === 3) {
          return createChain([routeRow])
        }
        if (selectCalls === 4) {
          return createChain([templateRow])
        }
        if (selectCalls === 5) {
          return createChain([versionRow])
        }
        return createChain([senderRow])
      }),
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
        emailType: "thank_you",
        offerId: "01900000-0000-7000-8000-000000000020",
        mergeData: {
          first_name: "Jane",
          quote_url: "https://example.com/q",
        },
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
      emailType: "thank_you",
      offerId: "01900000-0000-7000-8000-000000000020",
      mergeData: {
        first_name: "Jane",
        quote_url: "https://example.com/q",
      },
      route: routeRow,
      templateVersion: versionRow,
      sender: senderRow,
    })
  })

  it("rejects missing merge tags with 422 before createMessage", async () => {
    const selectRecipient = createChain([recipientRow])
    const execute = vi.fn(async () => undefined)

    let selectCalls = 0
    const tx = {
      execute,
      select: vi.fn(() => {
        selectCalls += 1
        if (selectCalls === 1) {
          return createChain([])
        }
        if (selectCalls === 2) {
          return createChain([routeRow])
        }
        if (selectCalls === 3) {
          return createChain([templateRow])
        }
        if (selectCalls === 4) {
          return createChain([versionRow])
        }
        return createChain([senderRow])
      }),
    } as unknown as EmailHubTx

    const db = {
      select: vi.fn(() => selectRecipient),
      insert: vi.fn(),
      transaction: vi.fn(async (fn: (tx: EmailHubTx) => Promise<unknown>) =>
        fn(tx)
      ),
    } as unknown as EmailHubDb

    const createMessage = vi.fn(async () => messageRow)

    await expect(
      triggerEmail(
        db,
        {
          email: "jane@example.com",
          idempotencyKey: "key-merge",
          emailType: "thank_you",
          mergeData: { first_name: "Jane" },
        },
        createMessage
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 422,
      details: [{ path: "merge_data.quote_url", message: "Required" }],
    })
    expect(createMessage).not.toHaveBeenCalled()
  })
})
