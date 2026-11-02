import { describe, expect, it } from "vitest"

import { serializeTemplate, serializeTemplateVersion } from "./serialize"

const at = new Date("2026-10-30T12:00:00.000Z")

describe("template serialize", () => {
  it("serializes template rows to snake_case JSON", () => {
    expect(
      serializeTemplate({
        id: "019a0000-0000-7000-8000-0000000000aa",
        name: "Welcome",
        emailType: "thank_you",
        categoryId: "019a0000-0000-7000-8000-000000000010",
        currentVersionId: null,
        status: "draft",
        createdBy: "019a0000-0000-7000-8000-000000000001",
        createdAt: at,
        updatedAt: at,
      })
    ).toEqual({
      id: "019a0000-0000-7000-8000-0000000000aa",
      name: "Welcome",
      email_type: "thank_you",
      category_id: "019a0000-0000-7000-8000-000000000010",
      current_version_id: null,
      status: "draft",
      created_by: "019a0000-0000-7000-8000-000000000001",
      created_at: "2026-10-30T12:00:00.000Z",
      updated_at: "2026-10-30T12:00:00.000Z",
    })
  })

  it("serializes version rows", () => {
    expect(
      serializeTemplateVersion({
        id: "019a0000-0000-7000-8000-0000000000bb",
        templateId: "019a0000-0000-7000-8000-0000000000aa",
        versionNo: 2,
        subject: "Hi {{name}}",
        bodySource: "<p>x</p>",
        mergeTags: { name: "string" },
        createdBy: "019a0000-0000-7000-8000-000000000001",
        createdAt: at,
      })
    ).toEqual({
      id: "019a0000-0000-7000-8000-0000000000bb",
      template_id: "019a0000-0000-7000-8000-0000000000aa",
      version_no: 2,
      subject: "Hi {{name}}",
      body_source: "<p>x</p>",
      merge_tags: { name: "string" },
      created_by: "019a0000-0000-7000-8000-000000000001",
      created_at: "2026-10-30T12:00:00.000Z",
    })
  })
})
