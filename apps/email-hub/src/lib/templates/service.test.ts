import { beforeEach, describe, expect, it, vi } from "vitest"

import type * as SharedModule from "@workspace/shared"

const writeAudit = vi.hoisted(() => vi.fn())
const getDb = vi.hoisted(() => vi.fn())
const renderEmailTemplate = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return {
    ...actual,
    writeAudit,
  }
})

vi.mock("@workspace/db/client", () => ({ getDb }))

vi.mock("@workspace/emails/render", () => ({
  renderEmailTemplate,
  TemplateRenderError: class TemplateRenderError extends Error {
    readonly code: string
    constructor(code: string, message: string) {
      super(message)
      this.name = "TemplateRenderError"
      this.code = code
    }
  },
}))

import {
  createTemplate,
  createTemplateVersion,
  getTemplate,
  listTemplates,
  publishTemplateVersion,
  updateTemplate,
} from "./service"

const userId = "019a0000-0000-7000-8000-000000000001"
const categoryId = "019a0000-0000-7000-8000-000000000010"
const templateId = "019a0000-0000-7000-8000-0000000000aa"
const versionId = "019a0000-0000-7000-8000-0000000000bb"
const at = new Date("2026-10-30T12:00:00.000Z")

function templateRow(
  overrides: Partial<{
    id: string
    name: string
    status: "draft" | "active" | "archived"
    currentVersionId: string | null
    categoryId: string
  }> = {}
) {
  return {
    id: overrides.id ?? templateId,
    name: overrides.name ?? "Welcome",
    emailType: "thank_you" as const,
    categoryId: overrides.categoryId ?? categoryId,
    currentVersionId: overrides.currentVersionId ?? null,
    status: overrides.status ?? ("draft" as const),
    createdBy: userId,
    createdAt: at,
    updatedAt: at,
  }
}

function versionRow(
  overrides: Partial<{ id: string; versionNo: number; templateId: string }> = {}
) {
  return {
    id: overrides.id ?? versionId,
    templateId: overrides.templateId ?? templateId,
    versionNo: overrides.versionNo ?? 1,
    subject: "Hi {{first_name}}",
    bodySource: "<p>Hello {{first_name}}</p>",
    mergeTags: { first_name: "string" },
    createdBy: userId,
    createdAt: at,
  }
}

/** Drizzle-style chain that resolves when awaited. */
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
    "for",
    "innerJoin",
    "leftJoin",
    "groupBy",
  ]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe("templates service", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
    getDb.mockReset()
    renderEmailTemplate.mockReset()
    renderEmailTemplate.mockResolvedValue({
      html: "Hello",
      text: "Hello",
      subject: "Hi",
      unsubscribeUrl: "https://example.com/publish-check/footer",
    })
  })

  it("lists templates with cursor pagination", async () => {
    const rows = [
      {
        template: templateRow({
          id: "019a0000-0000-7000-8000-000000000003",
          name: "C",
        }),
        category_name: "Thank you",
        category_kind: "transactional" as const,
        published_version_no: 1,
      },
      {
        template: templateRow({
          id: "019a0000-0000-7000-8000-000000000002",
          name: "B",
        }),
        category_name: "Thank you",
        category_kind: "transactional" as const,
        published_version_no: null,
      },
      {
        template: templateRow({
          id: "019a0000-0000-7000-8000-000000000001",
          name: "A",
        }),
        category_name: "Thank you",
        category_kind: "transactional" as const,
        published_version_no: null,
      },
    ]
    let selectCall = 0
    const db = {
      select: vi.fn(() => {
        selectCall += 1
        if (selectCall === 1) {
          return query(rows)
        }
        return query([
          {
            templateId: "019a0000-0000-7000-8000-000000000002",
            maxNo: 3,
          },
        ])
      }),
    }
    const result = await listTemplates(
      {
        limit: 2,
        status: "draft",
        emailType: "thank_you",
        categoryId,
        cursor: "019a0000-0000-7000-8000-000000000099",
      },
      db as never
    )
    expect(result.data).toHaveLength(2)
    expect(result.next_cursor).toBe("019a0000-0000-7000-8000-000000000002")
    expect(result.data[0]?.category_name).toBe("Thank you")
    expect(result.data[0]?.current_version_no).toBe(1)
    expect(result.data[1]?.current_version_no).toBe(3)
  })

  it("gets a template with versions", async () => {
    const tpl = templateRow()
    const versions = [
      versionRow({ versionNo: 2 }),
      versionRow({ versionNo: 1 }),
    ]
    let selectCall = 0
    const db = {
      select: vi.fn(() => {
        selectCall += 1
        if (selectCall === 1) {
          return query([tpl])
        }
        if (selectCall === 2) {
          return query(versions)
        }
        return query([
          { category_name: "Thank you", category_kind: "transactional" },
        ])
      }),
    }
    const result = await getTemplate(templateId, db as never)
    expect(result.id).toBe(templateId)
    expect(result.versions).toHaveLength(2)
    expect(result.category_name).toBe("Thank you")
    expect(result.current_version_no).toBe(2)
  })

  it("throws not_found when template is missing", async () => {
    const db = { select: vi.fn(() => query([])) }
    await expect(getTemplate(templateId, db as never)).rejects.toMatchObject({
      code: "not_found",
    })
  })

  it("creates a draft template and writes audit", async () => {
    const created = templateRow()
    let txSelect = 0
    const tx = {
      select: vi.fn(() => {
        txSelect += 1
        if (txSelect === 1) {
          return query([
            { category_name: "Thank you", category_kind: "transactional" },
          ])
        }
        return query([{ maxNo: null }])
      }),
      insert: vi.fn(() => query([created])),
    }
    const db = {
      select: vi.fn(() => query([{ id: categoryId }])),
      transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    }
    const result = await createTemplate(
      { name: "Welcome", categoryId, emailType: "thank_you" },
      { userId, requestId: "req-1" },
      db as never
    )
    expect(result.status).toBe("draft")
    expect(result.category_name).toBe("Thank you")
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "template.create" })
    )
  })

  it("rejects create when category is missing", async () => {
    const db = { select: vi.fn(() => query([])) }
    await expect(
      createTemplate(
        { name: "Welcome", categoryId, emailType: "thank_you" },
        { userId },
        db as never
      )
    ).rejects.toMatchObject({ code: "validation_failed" })
  })

  it("maps unique name violations on create to conflict", async () => {
    const db = {
      select: vi.fn(() => query([{ id: categoryId }])),
      transaction: async () => {
        throw Object.assign(new Error("dup"), { code: "23505" })
      },
    }
    await expect(
      createTemplate(
        { name: "Welcome", categoryId, emailType: "thank_you" },
        { userId },
        db as never
      )
    ).rejects.toMatchObject({ code: "conflict" })
  })

  it("archives when no active routes point at the template", async () => {
    const before = templateRow({ status: "active" })
    const after = templateRow({ status: "archived" })
    let selectCall = 0
    const tx = {
      select: vi.fn(() => {
        selectCall += 1
        if (selectCall === 1) return query([before])
        if (selectCall === 2) return query([])
        if (selectCall === 3 || selectCall === 5) {
          return query([
            { category_name: "Thank you", category_kind: "transactional" },
          ])
        }
        return query([{ maxNo: null }])
      }),
      update: vi.fn(() => query([after])),
    }
    const db = {
      transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    }
    const result = await updateTemplate(
      templateId,
      { status: "archived" },
      { userId },
      db as never
    )
    expect(result.status).toBe("archived")
  })

  it("blocks archive when an active route exists", async () => {
    const before = templateRow({ status: "active" })
    let selectCall = 0
    const tx = {
      select: vi.fn(() => {
        selectCall += 1
        if (selectCall === 1) return query([before])
        return query([{ id: "019a0000-0000-7000-8000-0000000000cc" }])
      }),
    }
    const db = {
      transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    }
    await expect(
      updateTemplate(
        templateId,
        { status: "archived" },
        { userId },
        db as never
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
  })

  it("creates an immutable version with extracted merge tags", async () => {
    const tpl = templateRow()
    const created = versionRow({ versionNo: 1 })
    let selectCall = 0
    const tx = {
      select: vi.fn(() => {
        selectCall += 1
        if (selectCall === 1) return query([tpl])
        return query([{ maxNo: null }])
      }),
      insert: vi.fn(() => query([created])),
    }
    const db = {
      transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    }
    const result = await createTemplateVersion(
      templateId,
      {
        subject: "Hi {{first_name}}",
        bodySource: "<p>{{first_name}}</p>",
      },
      { userId },
      db as never
    )
    expect(result.version_no).toBe(1)
    expect(result.merge_tags).toEqual({ first_name: "string" })
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "template_version.create" })
    )
  })

  it("publishes a version atomically", async () => {
    const before = templateRow({ status: "draft" })
    const version = versionRow()
    const after = templateRow({
      status: "active",
      currentVersionId: versionId,
    })
    let selectCall = 0
    const tx = {
      select: vi.fn(() => {
        selectCall += 1
        if (selectCall === 1) return query([before])
        if (selectCall === 2) return query([version])
        if (selectCall === 3) return query([{ kind: "transactional" }])
        if (selectCall === 4 || selectCall === 6) {
          return query([
            { category_name: "Thank you", category_kind: "transactional" },
          ])
        }
        if (selectCall === 5) return query([{ maxNo: null }])
        return query([{ versionNo: 1 }])
      }),
      update: vi.fn(() => query([after])),
    }
    const db = {
      transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    }
    const result = await publishTemplateVersion(
      templateId,
      versionId,
      { userId, requestId: "req-pub" },
      db as never
    )
    expect(result.current_version_id).toBe(versionId)
    expect(result.status).toBe("active")
    expect(result.current_version_no).toBe(1)
  })

  it("rejects publish for archived templates", async () => {
    const before = templateRow({ status: "archived" })
    const tx = {
      select: vi.fn(() => query([before])),
    }
    const db = {
      transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    }
    await expect(
      publishTemplateVersion(templateId, versionId, { userId }, db as never)
    ).rejects.toMatchObject({ code: "conflict" })
  })

  it("rejects publish when version is not on the template", async () => {
    const before = templateRow({ status: "draft" })
    let selectCall = 0
    const tx = {
      select: vi.fn(() => {
        selectCall += 1
        if (selectCall === 1) return query([before])
        return query([])
      }),
    }
    const db = {
      transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx),
    }
    await expect(
      publishTemplateVersion(templateId, versionId, { userId }, db as never)
    ).rejects.toMatchObject({ code: "not_found" })
  })
})
