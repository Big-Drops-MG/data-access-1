import { beforeEach, describe, expect, it, vi } from "vitest"

import type * as SharedModule from "@workspace/shared"
import type { Database } from "@workspace/db/client"

const writeAudit = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return {
    ...actual,
    writeAudit,
  }
})

import {
  archiveEmailRoute,
  createEmailRoute,
  getEmailRoute,
  listEmailRoutes,
  updateEmailRoute,
} from "./service"

const userId = "019a0000-0000-7000-8000-000000000001"
const templateId = "019a0000-0000-7000-8000-000000000010"
const senderId = "019a0000-0000-7000-8000-000000000011"
const domainId = "019a0000-0000-7000-8000-000000000012"
const offerId = "019a0000-0000-7000-8000-000000000013"
const routeId = "019a0000-0000-7000-8000-0000000000aa"
const versionId = "019a0000-0000-7000-8000-0000000000bb"
const at = new Date("2026-11-03T12:00:00.000Z")

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "insert",
    "values",
    "returning",
    "update",
    "set",
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

function templateRow(
  overrides: Partial<{
    status: "draft" | "active" | "archived"
    emailType: "thank_you" | "feedback_request" | "engagement"
    currentVersionId: string | null
  }> = {}
) {
  return {
    id: templateId,
    name: "Welcome",
    emailType: overrides.emailType ?? "thank_you",
    categoryId: "019a0000-0000-7000-8000-000000000014",
    currentVersionId:
      overrides.currentVersionId === undefined
        ? versionId
        : overrides.currentVersionId,
    status: overrides.status ?? "active",
    createdBy: userId,
    createdAt: at,
    updatedAt: at,
  }
}

function senderRow(
  overrides: Partial<{
    status: "active" | "inactive" | "pending_verification"
  }> = {}
) {
  return {
    id: senderId,
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

function domainRow(status: "verified" | "pending" | "inactive" = "verified") {
  return {
    id: domainId,
    name: "mail.example.com",
    sesIdentityArn: null,
    status,
    createdBy: userId,
    createdAt: at,
    updatedAt: at,
    verifiedAt: at,
  }
}

function routeRow(
  overrides: Partial<{
    id: string
    status: "active" | "inactive"
    version: number
    offerId: string | null
    emailType: "thank_you" | "feedback_request" | "engagement"
    templateId: string
  }> = {}
) {
  return {
    id: overrides.id ?? routeId,
    emailType: overrides.emailType ?? "thank_you",
    offerId: overrides.offerId === undefined ? offerId : overrides.offerId,
    templateId: overrides.templateId ?? templateId,
    senderId,
    status: overrides.status ?? "active",
    version: overrides.version ?? 1,
    createdBy: userId,
    createdAt: at,
    updatedAt: at,
  }
}

function dbWith(
  tx: {
    select: ReturnType<typeof selectQueue>
    insert?: unknown
    update?: unknown
  },
  outerSelect?: unknown
) {
  return {
    select: vi.fn(() => query(outerSelect ?? [])),
    transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
  }
}

describe("email routes service", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
  })

  it("lists routes with and without filters", async () => {
    const rows = [
      routeRow({ id: "019a0000-0000-7000-8000-0000000000a2" }),
      routeRow({ id: "019a0000-0000-7000-8000-0000000000a1" }),
    ]
    const db = { select: vi.fn(() => query(rows)) }

    const page = await listEmailRoutes({ limit: 1 }, db as never as Database)
    expect(page.data).toHaveLength(1)
    expect(page.next_cursor).toBe("019a0000-0000-7000-8000-0000000000a2")

    const filtered = await listEmailRoutes(
      {
        limit: 10,
        cursor: routeId,
        status: "active",
        emailType: "thank_you",
        offerId,
        templateId,
        senderId,
      },
      db as never as Database
    )
    expect(filtered.next_cursor).toBeNull()
  })

  it("gets a route and 404s when missing", async () => {
    const db = { select: vi.fn(() => query([routeRow()])) }
    await expect(
      getEmailRoute(routeId, db as never as Database)
    ).resolves.toMatchObject({
      id: routeId,
      email_type: "thank_you",
      offer_id: offerId,
      version: 1,
    })

    const missing = { select: vi.fn(() => query([])) }
    await expect(
      getEmailRoute(routeId, missing as never as Database)
    ).rejects.toMatchObject({ code: "not_found", status: 404 })
  })

  it("creates an active route for a published template and active sender", async () => {
    const created = routeRow()
    const tx = {
      select: selectQueue([
        [templateRow()],
        [senderRow()],
        [domainRow()],
        [{ id: offerId }],
      ]),
      insert: vi.fn(() => query([created])),
    }
    const db = dbWith(tx)

    const result = await createEmailRoute(
      {
        emailType: "thank_you",
        offerId,
        templateId,
        senderId,
      },
      { userId, requestId: "req-1" },
      db as never as Database
    )

    expect(result).toMatchObject({
      id: routeId,
      status: "active",
      version: 1,
      created_at: at.toISOString(),
    })
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "email_route.create",
        objectType: "email_route",
        objectId: routeId,
        requestId: "req-1",
      })
    )
  })

  it("creates a default route when offer_id is null", async () => {
    const tx = {
      select: selectQueue([[templateRow()], [senderRow()], [domainRow()]]),
      insert: vi.fn(() => query([routeRow({ offerId: null })])),
    }
    const db = dbWith(tx)

    const result = await createEmailRoute(
      {
        emailType: "thank_you",
        offerId: null,
        templateId,
        senderId,
      },
      { userId },
      db as never as Database
    )
    expect(result.offer_id).toBeNull()
    expect(tx.select).toHaveBeenCalledTimes(3)
  })

  it("rejects create when the template, sender, domain, or offer is not usable", async () => {
    const cases: { selects: unknown[]; message: string }[] = [
      { selects: [[]], message: "Template not found" },
      {
        selects: [[templateRow({ status: "draft" })]],
        message: "Template must be published",
      },
      {
        selects: [[templateRow({ currentVersionId: null })]],
        message: "Template must be published",
      },
      {
        selects: [[templateRow({ emailType: "engagement" })]],
        message: "Template email type must match the route",
      },
      {
        selects: [[templateRow()], []],
        message: "Sender not found",
      },
      {
        selects: [[templateRow()], [senderRow({ status: "inactive" })]],
        message: "Sender must be active",
      },
      {
        selects: [[templateRow()], [senderRow()], []],
        message: "Sender must be on an active domain",
      },
      {
        selects: [[templateRow()], [senderRow()], [domainRow("pending")]],
        message: "Sender must be on an active domain",
      },
      {
        selects: [[templateRow()], [senderRow()], [domainRow()], []],
        message: "Offer not found",
      },
    ]

    for (const testCase of cases) {
      const tx = { select: selectQueue(testCase.selects), insert: vi.fn() }
      const db = dbWith(tx)
      await expect(
        createEmailRoute(
          { emailType: "thank_you", offerId, templateId, senderId },
          { userId },
          db as never as Database
        )
      ).rejects.toMatchObject({
        code: "validation_failed",
        status: 422,
        details: [expect.objectContaining({ message: testCase.message })],
      })
      expect(tx.insert).not.toHaveBeenCalled()
    }
  })

  it("maps a duplicate active pair to 409", async () => {
    const tx = {
      select: selectQueue([
        [templateRow()],
        [senderRow()],
        [domainRow()],
        [{ id: offerId }],
      ]),
      insert: vi.fn(() => {
        const q = query(null)
        q.then = (
          _onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) =>
          Promise.reject({ cause: { code: "23505" } }).then(
            undefined,
            onRejected
          )
        return q
      }),
    }
    const db = dbWith(tx, [{ id: routeId }])

    await expect(
      createEmailRoute(
        { emailType: "thank_you", offerId, templateId, senderId },
        { userId },
        db as never as Database
      )
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: expect.arrayContaining([
        expect.objectContaining({ path: "email_route", message: routeId }),
        expect.objectContaining({ path: "offer_id", message: offerId }),
      ]),
    })
  })

  it("returns 500 when insert yields no row and rethrows other errors", async () => {
    const empty = {
      select: selectQueue([
        [templateRow()],
        [senderRow()],
        [domainRow()],
        [{ id: offerId }],
      ]),
      insert: vi.fn(() => query([])),
    }
    await expect(
      createEmailRoute(
        { emailType: "thank_you", offerId, templateId, senderId },
        { userId },
        dbWith(empty) as never as Database
      )
    ).rejects.toMatchObject({ code: "internal", status: 500 })

    const broken = {
      select: selectQueue([
        [templateRow()],
        [senderRow()],
        [domainRow()],
        [{ id: offerId }],
      ]),
      insert: vi.fn(() => {
        const q = query(null)
        q.then = (
          _onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => Promise.reject(new Error("db down")).then(undefined, onRejected)
        return q
      }),
    }
    await expect(
      createEmailRoute(
        { emailType: "thank_you", offerId, templateId, senderId },
        { userId },
        dbWith(broken) as never as Database
      )
    ).rejects.toThrow("db down")
  })

  it("rejects update when version mismatches", async () => {
    const tx = {
      select: selectQueue([[routeRow({ version: 3 })]]),
      update: vi.fn(),
    }
    await expect(
      updateEmailRoute(
        routeId,
        { version: 1, status: "inactive" },
        { userId },
        dbWith(tx) as never as Database
      )
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: expect.arrayContaining([
        expect.objectContaining({ path: "version", message: "3" }),
      ]),
    })
    expect(tx.update).not.toHaveBeenCalled()
  })

  it("archives without rechecking the template or sender", async () => {
    const tx = {
      select: selectQueue([[routeRow({ status: "active", version: 1 })]]),
      update: vi.fn(() =>
        query([routeRow({ status: "inactive", version: 2 })])
      ),
    }
    const result = await updateEmailRoute(
      routeId,
      { version: 1, status: "inactive" },
      { userId, requestId: "req-archive" },
      dbWith(tx) as never as Database
    )
    expect(result.status).toBe("inactive")
    expect(result.version).toBe(2)
    expect(tx.select).toHaveBeenCalledTimes(1)
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "email_route.archive" })
    )
  })

  it("rejects a patch that points an active route at an unpublished template", async () => {
    const tx = {
      select: selectQueue([[routeRow()], [templateRow({ status: "draft" })]]),
      update: vi.fn(),
    }
    await expect(
      updateEmailRoute(
        routeId,
        { version: 1, templateId },
        { userId },
        dbWith(tx) as never as Database
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [
        expect.objectContaining({ message: "Template must be published" }),
      ],
    })
    expect(tx.update).not.toHaveBeenCalled()
  })

  it("bumps version when clearing offer_id on an active route", async () => {
    const after = routeRow({ offerId: null, version: 2 })
    const tx = {
      select: selectQueue([
        [routeRow()],
        [templateRow()],
        [senderRow()],
        [domainRow()],
      ]),
      update: vi.fn(() => query([after])),
    }
    const result = await updateEmailRoute(
      routeId,
      { version: 1, offerId: null },
      { userId, requestId: "req-2" },
      dbWith(tx) as never as Database
    )
    expect(result.offer_id).toBeNull()
    expect(result.version).toBe(2)
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "email_route.update" })
    )
  })

  it("returns the current row when a versioned update loses the race", async () => {
    const tx = {
      select: selectQueue([
        [routeRow({ version: 1 })],
        [templateRow()],
        [senderRow()],
        [domainRow()],
        [{ id: offerId }],
        [routeRow({ version: 4 })],
      ]),
      update: vi.fn(() => query([])),
    }
    await expect(
      updateEmailRoute(
        routeId,
        { version: 1, status: "active" },
        { userId },
        dbWith(tx) as never as Database
      )
    ).rejects.toMatchObject({
      code: "conflict",
      details: expect.arrayContaining([
        expect.objectContaining({ path: "version", message: "4" }),
      ]),
    })
  })

  it("maps a patch that collides with another active pair to 409", async () => {
    const otherId = "019a0000-0000-7000-8000-0000000000cc"
    const tx = {
      select: selectQueue([
        [routeRow({ offerId: null })],
        [templateRow()],
        [senderRow()],
        [domainRow()],
        [{ id: offerId }],
      ]),
      update: vi.fn(() => {
        const q = query(null)
        q.then = (
          _onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) =>
          Promise.reject({ cause: { code: "23505" } }).then(
            undefined,
            onRejected
          )
        return q
      }),
    }
    const db = dbWith(tx, [{ id: otherId }])
    await expect(
      updateEmailRoute(
        routeId,
        { version: 1, offerId },
        { userId },
        db as never as Database
      )
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: expect.arrayContaining([
        expect.objectContaining({ path: "email_route", message: otherId }),
      ]),
    })
  })

  it("archives an active route and does not rewrite an inactive one", async () => {
    const tx = {
      select: selectQueue([[routeRow({ status: "active", version: 1 })]]),
      update: vi.fn(() =>
        query([routeRow({ status: "inactive", version: 2 })])
      ),
    }
    const archived = await archiveEmailRoute(
      routeId,
      { userId, requestId: "req-archive" },
      dbWith(tx) as never as Database
    )
    expect(archived.status).toBe("inactive")
    expect(archived.version).toBe(2)
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "email_route.archive",
        requestId: "req-archive",
      })
    )

    writeAudit.mockClear()
    const againTx = {
      select: selectQueue([[routeRow({ status: "inactive", version: 2 })]]),
      update: vi.fn(),
    }
    const repeated = await archiveEmailRoute(
      routeId,
      { userId },
      dbWith(againTx) as never as Database
    )
    expect(repeated.version).toBe(2)
    expect(againTx.update).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("rethrows unexpected update errors", async () => {
    const tx = {
      select: selectQueue([[routeRow({ status: "inactive" })]]),
      update: vi.fn(() => {
        const q = query(null)
        q.then = (
          _onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => Promise.reject(new Error("db down")).then(undefined, onRejected)
        return q
      }),
    }
    await expect(
      updateEmailRoute(
        routeId,
        { version: 1, status: "inactive" },
        { userId },
        dbWith(tx) as never as Database
      )
    ).rejects.toThrow("db down")
  })
})
