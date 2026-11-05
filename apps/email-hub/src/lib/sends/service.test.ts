import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"
import type * as LoggerModule from "@workspace/logger"
import type * as SharedModule from "@workspace/shared"
import { AppError } from "@workspace/shared"

const writeAudit = vi.hoisted(() => vi.fn())
const infoLog = vi.hoisted(() => vi.fn())
const warnLog = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return { ...actual, writeAudit }
})

vi.mock("@workspace/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof LoggerModule
  return {
    ...actual,
    getContextLogger: () => ({
      info: infoLog,
      warn: warnLog,
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }
})

import {
  cancelSend,
  createSend,
  deleteSend,
  getSend,
  listSends,
  scheduleSend,
  updateSend,
} from "./service"

const userId = "019a0000-0000-7000-8000-000000000001"
const otherUserId = "019a0000-0000-7000-8000-000000000002"
const templateVersionId = "019a0000-0000-7000-8000-0000000000bb"
const otherVersionId = "019a0000-0000-7000-8000-0000000000bc"
const senderId = "019a0000-0000-7000-8000-000000000011"
const otherSenderId = "019a0000-0000-7000-8000-000000000021"
const domainId = "019a0000-0000-7000-8000-000000000012"
const offerId = "019a0000-0000-7000-8000-000000000013"
const categoryId = "019a0000-0000-7000-8000-000000000014"
const sendId = "019a0000-0000-7000-8000-0000000000aa"
const at = new Date("2026-11-05T12:00:00.000Z")
const clock = new Date("2026-11-05T12:00:00.000Z")

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "innerJoin",
    "leftJoin",
    "groupBy",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "delete",
  ]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

function selectQueue(results: unknown[]) {
  const fn = vi.fn()
  for (const result of results) {
    fn.mockReturnValueOnce(query(result))
  }
  fn.mockReturnValue(query([]))
  return fn
}

function templateJoin(
  overrides: Partial<{
    status: "draft" | "active" | "archived"
    emailType: "thank_you" | "feedback_request" | "engagement"
    categoryId: string
    currentVersionId: string | null
  }> = {}
) {
  return {
    emailType: overrides.emailType ?? "thank_you",
    categoryId: overrides.categoryId ?? categoryId,
    status: overrides.status ?? "active",
    currentVersionId:
      overrides.currentVersionId === undefined
        ? templateVersionId
        : overrides.currentVersionId,
  }
}

function senderRow(
  overrides: Partial<{
    id: string
    status: "active" | "inactive" | "pending_verification"
  }> = {}
) {
  return {
    id: overrides.id ?? senderId,
    domainId,
    fromName: "Factory",
    fromEmail: "noreply@mail.example.com",
    replyTo: null,
    status: overrides.status ?? "active",
    version: 1,
    createdBy: userId,
    createdAt: at,
    updatedAt: at,
    deactivatedAt: null,
  }
}

function sendRow(
  overrides: Partial<{
    name: string
    status:
      | "draft"
      | "scheduled"
      | "queued"
      | "dispatching"
      | "completed"
      | "cancelled"
      | "failed"
    version: number
    offerId: string | null
    senderId: string
    categoryId: string
    templateVersionId: string
    emailType: "thank_you" | "feedback_request" | "engagement"
    scheduledFor: Date
  }> = {}
) {
  return {
    id: sendId,
    name: overrides.name ?? "October relationship update",
    emailType: overrides.emailType ?? "thank_you",
    templateVersionId: overrides.templateVersionId ?? templateVersionId,
    senderId: overrides.senderId ?? senderId,
    categoryId: overrides.categoryId ?? categoryId,
    offerId: overrides.offerId === undefined ? null : overrides.offerId,
    scheduledFor:
      overrides.scheduledFor ?? new Date(clock.getTime() + 30 * 60_000),
    status: overrides.status ?? "draft",
    dispatchStartedAt: null,
    completedAt: null,
    version: overrides.version ?? 1,
    createdBy: userId,
    createdAt: at,
    updatedAt: at,
  }
}

function displayEnrichmentEmpty() {
  return [[], [], [], []] as const
}

function references(template = templateJoin()) {
  return [
    [template],
    [{ id: categoryId, isActive: true }],
    [senderRow()],
    [{ status: "verified" }],
  ]
}

function dbWith(tx: {
  select: ReturnType<typeof selectQueue>
  insert?: unknown
  update?: unknown
  delete?: unknown
}) {
  return {
    select: vi.fn(() => query([])),
    transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
  }
}

describe("sends service", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
    infoLog.mockReset()
    warnLog.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(clock)
  })

  it("lists sends and pages by id", async () => {
    const rows = [
      sendRow(),
      { ...sendRow(), id: "019a0000-0000-7000-8000-0000000000a1" },
    ]
    const pageDb = {
      select: selectQueue([rows.slice(0, 2), ...displayEnrichmentEmpty()]),
    }
    const page = await listSends({ limit: 1 }, pageDb as never as Database)
    expect(page.data).toHaveLength(1)
    expect(page.data[0]).toMatchObject({
      id: sendId,
      name: "October relationship update",
      status: "draft",
      template_version_id: templateVersionId,
      sender_id: senderId,
      category_id: categoryId,
      offer_id: null,
    })
    expect(page.next_cursor).toBe(sendId)

    const filteredDb = {
      select: selectQueue([rows, ...displayEnrichmentEmpty()]),
    }
    const filtered = await listSends(
      {
        limit: 10,
        cursor: sendId,
        status: "draft",
        emailType: "thank_you",
        offerId,
        senderId,
        categoryId,
        templateVersionId,
      },
      filteredDb as never as Database
    )
    expect(filtered.data).toHaveLength(2)
    expect(filtered.next_cursor).toBeNull()
  })

  it("reads a send and 404s when it is missing", async () => {
    const db = {
      select: selectQueue([[sendRow()], ...displayEnrichmentEmpty(), [], []]),
    }
    await expect(
      getSend(sendId, db as never as Database)
    ).resolves.toMatchObject({
      id: sendId,
      name: "October relationship update",
      scheduled_for: "2026-11-05T12:30:00.000Z",
    })
    const missing = { select: vi.fn(() => query([])) }
    await expect(
      getSend(sendId, missing as never as Database)
    ).rejects.toMatchObject({ code: "not_found", status: 404 })
  })

  it("creates a draft and audits it without scheduling", async () => {
    const created = sendRow({ offerId })
    const tx = {
      select: selectQueue([
        [templateJoin()],
        ...references(),
        [{ id: offerId }],
      ]),
      insert: vi.fn(() => query([created])),
      update: vi.fn(),
    }
    const db = dbWith(tx)
    const result = await createSend(
      {
        name: "October relationship update",
        templateVersionId,
        senderId,
        categoryId,
        offerId,
        scheduledFor: created.scheduledFor,
      },
      { userId, requestId: "req-create-1" },
      db as never as Database
    )

    expect(result).toMatchObject({
      name: "October relationship update",
      status: "draft",
      version: 1,
      template_version_id: templateVersionId,
      sender_id: senderId,
      category_id: categoryId,
      offer_id: offerId,
      created_by: userId,
    })
    expect(tx.update).not.toHaveBeenCalled()
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actor: { type: "user", id: userId },
        action: "send.create",
        objectType: "send",
        objectId: sendId,
        requestId: "req-create-1",
        after: expect.objectContaining({ status: "draft" }),
      })
    )
    expect(infoLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "sends.created",
        actor_id: userId,
        send_id: sendId,
        new_status: "draft",
        request_id: "req-create-1",
      }),
      "Send created"
    )
    const auditPayload = writeAudit.mock.calls[0]?.[1] as {
      after: Record<string, unknown>
    }
    expect(auditPayload.after).not.toHaveProperty("body_source")
    expect(JSON.stringify(auditPayload.after)).not.toMatch(
      /password|secret|token/i
    )
  })

  it("rejects create when references are unusable", async () => {
    const cases: { selects: unknown[]; path: string; message: string }[] = [
      {
        selects: [[]],
        path: "template_version_id",
        message: "Template version not found",
      },
      {
        selects: [[templateJoin({ status: "archived" })]],
        path: "template_version_id",
        message: "Template is archived",
      },
      {
        selects: [
          [templateJoin()],
          [
            templateJoin({
              categoryId: "019a0000-0000-7000-8000-000000000099",
            }),
          ],
        ],
        path: "category_id",
        message: "Category must match the template",
      },
      {
        selects: [
          [templateJoin()],
          [templateJoin()],
          [{ id: categoryId, isActive: false }],
        ],
        path: "category_id",
        message: "Category must be active",
      },
      {
        selects: [
          [templateJoin()],
          [templateJoin()],
          [{ id: categoryId, isActive: true }],
          [],
        ],
        path: "sender_id",
        message: "Sender not found",
      },
      {
        selects: [
          [templateJoin()],
          [templateJoin()],
          [{ id: categoryId, isActive: true }],
          [senderRow({ status: "inactive" })],
        ],
        path: "sender_id",
        message: "Sender must be active",
      },
      {
        selects: [
          [templateJoin()],
          [templateJoin()],
          [{ id: categoryId, isActive: true }],
          [senderRow()],
          [{ status: "inactive" }],
        ],
        path: "sender_id",
        message: "Sender must be on an active domain",
      },
      {
        selects: [...([[templateJoin()]] as unknown[]), ...references(), []],
        path: "offer_id",
        message: "Offer not found",
      },
    ]

    for (const testCase of cases) {
      writeAudit.mockClear()
      const tx = {
        select: selectQueue(testCase.selects),
        insert: vi.fn(() => query([sendRow()])),
      }
      const db = dbWith(tx)
      await expect(
        createSend(
          {
            name: "October relationship update",
            templateVersionId,
            senderId,
            categoryId,
            offerId,
            scheduledFor: at,
          },
          { userId },
          db as never as Database
        )
      ).rejects.toMatchObject({
        code: "validation_failed",
        status: 422,
        details: [
          expect.objectContaining({
            path: testCase.path,
            message: testCase.message,
          }),
        ],
      })
      expect(tx.insert).not.toHaveBeenCalled()
      expect(writeAudit).not.toHaveBeenCalled()
    }
  })

  it("updates a draft, keeps omitted fields, and bumps version", async () => {
    const sets: Record<string, unknown>[] = []
    const before = sendRow({ offerId })
    const after = sendRow({
      offerId,
      senderId: otherSenderId,
      version: 2,
    })
    const updateChain = query([after])
    updateChain.set = vi.fn((value: Record<string, unknown>) => {
      sets.push(value)
      return updateChain
    })
    const tx = {
      select: selectQueue([
        [before],
        [templateJoin()],
        ...references(),
        [{ id: offerId }],
      ]),
      update: vi.fn(() => updateChain),
    }
    const db = dbWith(tx)
    const result = await updateSend(
      sendId,
      { version: 1, senderId: otherSenderId },
      { userId: otherUserId, requestId: "req-update-1" },
      db as never as Database
    )

    expect(result).toMatchObject({
      sender_id: otherSenderId,
      template_version_id: templateVersionId,
      offer_id: offerId,
      version: 2,
      status: "draft",
    })
    expect(sets[0]).toMatchObject({
      senderId: otherSenderId,
      templateVersionId,
      categoryId,
      offerId,
      version: 2,
    })
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "send.update",
        actor: { type: "user", id: otherUserId },
        before: expect.objectContaining({ sender_id: senderId, version: 1 }),
        after: expect.objectContaining({
          sender_id: otherSenderId,
          version: 2,
        }),
      })
    )
    expect(infoLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "sends.updated",
        previous_status: "draft",
      }),
      "Send updated"
    )
  })

  it("rejects a stale update and leaves the newer row as the conflict body", async () => {
    const current = sendRow({ version: 2, senderId: otherSenderId })
    const tx = {
      select: selectQueue([[current]]),
      update: vi.fn(),
    }
    const db = dbWith(tx)
    await expect(
      updateSend(
        sendId,
        { version: 1, senderId },
        { userId },
        db as never as Database
      )
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: expect.arrayContaining([
        { path: "version", message: "2" },
        { path: "sender_id", message: otherSenderId },
      ]),
    })
    expect(tx.update).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "sends.version_conflict",
        send_id: sendId,
      }),
      "Send version conflict"
    )
  })

  it("rejects edits once the send is scheduled", async () => {
    const locked = sendRow({ status: "scheduled" })
    const fields = [
      { templateVersionId: otherVersionId },
      { senderId: otherSenderId },
      { categoryId: "019a0000-0000-7000-8000-000000000099" },
      { offerId },
      { scheduledFor: new Date(clock.getTime() + 60 * 60_000) },
    ]
    for (const patch of fields) {
      writeAudit.mockClear()
      warnLog.mockClear()
      const tx = {
        select: selectQueue([[locked]]),
        update: vi.fn(),
      }
      await expect(
        updateSend(
          sendId,
          { version: 1, ...patch },
          { userId },
          dbWith(tx) as never as Database
        )
      ).rejects.toMatchObject({
        code: "conflict",
        status: 409,
        details: [{ path: "status", message: "Send configuration is locked" }],
      })
      expect(tx.update).not.toHaveBeenCalled()
      expect(writeAudit).not.toHaveBeenCalled()
      expect(warnLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "sends.transition_rejected",
          previous_status: "scheduled",
          new_status: "scheduled",
        }),
        "Send configuration is locked"
      )
    }
  })

  it("deletes a draft and refuses scheduled or linked sends", async () => {
    const tx = {
      select: selectQueue([[sendRow()], []]),
      delete: vi.fn(() => query([sendRow()])),
    }
    const deleted = await deleteSend(
      sendId,
      1,
      { userId, requestId: "req-delete-1" },
      dbWith(tx) as never as Database
    )
    expect(deleted.status).toBe("draft")
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "send.delete",
        before: expect.objectContaining({ id: sendId }),
        after: null,
      })
    )

    writeAudit.mockClear()
    const scheduled = {
      select: selectQueue([[sendRow({ status: "scheduled" })]]),
      delete: vi.fn(),
    }
    await expect(
      deleteSend(sendId, 1, { userId }, dbWith(scheduled) as never as Database)
    ).rejects.toMatchObject({
      code: "conflict",
      details: [{ path: "status", message: "Only draft sends can be deleted" }],
    })
    expect(scheduled.delete).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()

    const linked = {
      select: selectQueue([
        [sendRow()],
        [{ id: "019a0000-0000-7000-8000-0000000000ee" }],
      ]),
      delete: vi.fn(),
    }
    await expect(
      deleteSend(sendId, 1, { userId }, dbWith(linked) as never as Database)
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
    expect(linked.delete).not.toHaveBeenCalled()
  })

  it.each([
    ["TIME-01", -60_000],
    ["TIME-02", 0],
    ["TIME-03", 60_000],
    ["TIME-04", 5 * 60_000 - 1_000],
  ] as const)("schedule %s rejects", async (_id, offsetMs) => {
    const scheduledFor = new Date(clock.getTime() + offsetMs)
    const tx = {
      select: selectQueue([[sendRow({ scheduledFor })], ...references()]),
      update: vi.fn(),
    }
    await expect(
      scheduleSend(
        sendId,
        1,
        { userId, requestId: "req-schedule-1" },
        dbWith(tx) as never as Database
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 422,
      details: [{ path: "scheduled_for" }],
    })
    expect(tx.update).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it.each([
    ["TIME-05", 5 * 60_000],
    ["TIME-06", 5 * 60_000 + 1_000],
    ["TIME-07", 30 * 60_000],
  ] as const)("schedule %s accepts", async (_id, offsetMs) => {
    const scheduledFor = new Date(clock.getTime() + offsetMs)
    const before = sendRow({ scheduledFor })
    const after = sendRow({ scheduledFor, status: "scheduled", version: 2 })
    const tx = {
      select: selectQueue([[before], ...references()]),
      update: vi.fn(() => query([after])),
    }
    await expect(
      scheduleSend(
        sendId,
        1,
        { userId, requestId: "req-schedule-1" },
        dbWith(tx) as never as Database
      )
    ).resolves.toMatchObject({
      status: "scheduled",
      version: 2,
      template_version_id: templateVersionId,
      scheduled_for: scheduledFor.toISOString(),
    })
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "send.schedule",
        before: expect.objectContaining({ status: "draft" }),
        after: expect.objectContaining({
          status: "scheduled",
          template_version_id: templateVersionId,
        }),
      })
    )
    expect(infoLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "sends.scheduled",
        previous_status: "draft",
        new_status: "scheduled",
      }),
      "Send scheduled"
    )
  })

  it("rejects schedule when the pinned version is not the current published one", async () => {
    const tx = {
      select: selectQueue([
        [sendRow()],
        [templateJoin({ status: "draft", currentVersionId: null })],
      ]),
      update: vi.fn(),
    }
    await expect(
      scheduleSend(sendId, 1, { userId }, dbWith(tx) as never as Database)
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [
        expect.objectContaining({
          path: "template_version_id",
          message: "Template version must be the current published version",
        }),
      ],
    })
    expect(tx.update).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("rejects a second schedule and does not write a success audit", async () => {
    const tx = {
      select: selectQueue([[sendRow({ status: "scheduled", version: 2 })]]),
      update: vi.fn(),
    }
    await expect(
      scheduleSend(sendId, 2, { userId }, dbWith(tx) as never as Database)
    ).rejects.toMatchObject({
      code: "conflict",
      details: [
        {
          path: "status",
          message: "Cannot transition from scheduled to scheduled",
        },
      ],
    })
    expect(tx.update).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sends.transition_rejected" }),
      "Send transition rejected"
    )
  })

  it("treats a lost conditional schedule update as a conflict", async () => {
    const tx = {
      select: selectQueue([
        [sendRow()],
        ...references(),
        [sendRow({ status: "scheduled", version: 2 })],
      ]),
      update: vi.fn(() => query([])),
    }
    await expect(
      scheduleSend(sendId, 1, { userId }, dbWith(tx) as never as Database)
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
    expect(writeAudit).not.toHaveBeenCalled()
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sends.version_conflict" }),
      "Send version conflict"
    )
  })

  it("cancels a scheduled send and rejects cancel of a completed send", async () => {
    const before = sendRow({ status: "scheduled" })
    const after = sendRow({ status: "cancelled", version: 2 })
    const tx = {
      select: selectQueue([[before]]),
      update: vi.fn(() => query([after])),
    }
    await expect(
      cancelSend(
        sendId,
        1,
        { userId, requestId: "req-cancel-1" },
        dbWith(tx) as never as Database
      )
    ).resolves.toMatchObject({ status: "cancelled", version: 2 })
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "send.cancel",
        before: expect.objectContaining({ status: "scheduled" }),
        after: expect.objectContaining({ status: "cancelled" }),
      })
    )
    expect(infoLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sends.cancelled" }),
      "Send cancelled"
    )

    writeAudit.mockClear()
    const completed = {
      select: selectQueue([[sendRow({ status: "completed" })]]),
      update: vi.fn(),
    }
    await expect(
      cancelSend(sendId, 1, { userId }, dbWith(completed) as never as Database)
    ).rejects.toMatchObject({
      code: "conflict",
      details: [
        {
          path: "status",
          message: "Cannot transition from completed to cancelled",
        },
      ],
    })
    expect(completed.update).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("rejects rescheduling a cancelled send", async () => {
    const tx = {
      select: selectQueue([[sendRow({ status: "cancelled" })]]),
      update: vi.fn(),
    }
    await expect(
      scheduleSend(sendId, 1, { userId }, dbWith(tx) as never as Database)
    ).rejects.toMatchObject({
      code: "conflict",
      details: [
        {
          path: "status",
          message: "Cannot transition from cancelled to scheduled",
        },
      ],
    })
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("does not report success when the insert returns no row", async () => {
    const tx = {
      select: selectQueue([[templateJoin()], ...references()]),
      insert: vi.fn(() => query([])),
    }
    await expect(
      createSend(
        {
          name: "October relationship update",
          templateVersionId,
          senderId,
          categoryId,
          scheduledFor: new Date(clock.getTime() + 30 * 60_000),
        },
        { userId },
        dbWith(tx) as never as Database
      )
    ).rejects.toMatchObject({ code: "internal", status: 500 })
    expect(writeAudit).not.toHaveBeenCalled()
    expect(infoLog).not.toHaveBeenCalled()
  })

  it("propagates an audit failure instead of returning the send", async () => {
    writeAudit.mockRejectedValueOnce(new AppError("unavailable"))
    const tx = {
      select: selectQueue([[templateJoin()], ...references()]),
      insert: vi.fn(() => query([sendRow()])),
    }
    await expect(
      createSend(
        {
          name: "October relationship update",
          templateVersionId,
          senderId,
          categoryId,
          scheduledFor: new Date(clock.getTime() + 30 * 60_000),
        },
        { userId },
        dbWith(tx) as never as Database
      )
    ).rejects.toMatchObject({ code: "unavailable" })
    expect(infoLog).not.toHaveBeenCalled()
  })
})
