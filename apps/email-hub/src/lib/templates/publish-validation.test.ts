import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const renderEmailTemplate = vi.hoisted(() => vi.fn())

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

import { validateTemplateForPublishing } from "./publish-validation"

const TAG_UNSUBSCRIBE_URL = "https://example.com/publish-check/unsubscribe"
const TAG_POSTAL_ADDRESS = "Publish Check Postal Address"

const source = `import { Html, Head, Body, Container, Text } from "@react-email/components"
export default function Template() {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Text>Hello {{firstName}}</Text>
        </Container>
      </Body>
    </Html>
  )
}`

function rendered(includeTags: boolean) {
  const extra = includeTags
    ? ` ${TAG_UNSUBSCRIBE_URL} ${TAG_POSTAL_ADDRESS}`
    : ""
  return {
    html: `Hello${extra}`,
    text: `Hello${extra}`,
    subject: "Hi",
    unsubscribeUrl: "https://example.com/publish-check/footer",
  }
}

describe("validateTemplateForPublishing", () => {
  beforeEach(() => {
    renderEmailTemplate.mockReset()
  })

  it("publishes a transactional template after a successful render", async () => {
    renderEmailTemplate.mockResolvedValue(rendered(false))
    await expect(
      validateTemplateForPublishing({
        subject: "Hi {{firstName}}",
        bodySource: source,
        categoryKind: "transactional",
      })
    ).resolves.toBeUndefined()
    expect(renderEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        source,
        unsubscribeUrl: "https://example.com/publish-check/footer",
        postalAddress: "Publish Check Footer Address",
      })
    )
  })

  it("requires both live compliance tags for other category kinds", async () => {
    renderEmailTemplate.mockResolvedValue(rendered(false))
    await expect(
      validateTemplateForPublishing({
        subject: "Hi",
        bodySource: source,
        categoryKind: "relationship",
      })
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 422,
      details: [
        { path: "body_source", message: "TEMPLATE_UNSUBSCRIBE_TAG_MISSING" },
        { path: "body_source", message: "TEMPLATE_POSTAL_ADDRESS_TAG_MISSING" },
      ],
    })
  })

  it("rejects a tag that is in the source but missing from the rendered body", async () => {
    renderEmailTemplate.mockResolvedValue(rendered(false))
    const tagged = source.replace(
      "Hello {{firstName}}",
      "Hello {{unsubscribe_url}} {{postal_address}}"
    )
    await expect(
      validateTemplateForPublishing({
        subject: "Hi",
        bodySource: tagged,
        categoryKind: "relationship",
      })
    ).rejects.toMatchObject({
      details: [
        { message: "TEMPLATE_UNSUBSCRIBE_TAG_INVALID" },
        { message: "TEMPLATE_POSTAL_ADDRESS_TAG_INVALID" },
      ],
    })
  })

  it("accepts a relationship template when both sentinels are in html and text", async () => {
    renderEmailTemplate.mockResolvedValue(rendered(true))
    const tagged = source.replace(
      "Hello {{firstName}}",
      "Hello {{unsubscribe_url}} {{postal_address}}"
    )
    await expect(
      validateTemplateForPublishing({
        subject: "Hi",
        bodySource: tagged,
        categoryKind: "relationship",
      })
    ).resolves.toBeUndefined()
  })

  it("maps renderer failures onto publish error details", async () => {
    const { TemplateRenderError } = await import("@workspace/emails/render")
    renderEmailTemplate.mockRejectedValueOnce(
      new TemplateRenderError("timeout", "slow")
    )
    await expect(
      validateTemplateForPublishing({
        subject: "Hi",
        bodySource: source,
        categoryKind: "transactional",
      })
    ).rejects.toMatchObject({
      details: [{ message: "TEMPLATE_RENDER_TIMEOUT" }],
    })

    renderEmailTemplate.mockRejectedValueOnce(
      new TemplateRenderError("render_failed", "bad")
    )
    await expect(
      validateTemplateForPublishing({
        subject: "Hi",
        bodySource: source,
        categoryKind: "transactional",
      })
    ).rejects.toMatchObject({
      details: [{ message: "TEMPLATE_RENDER_FAILED" }],
    })

    const appError = AppError.validationFailed([
      { path: "body_source", message: "kept" },
    ])
    renderEmailTemplate.mockRejectedValueOnce(appError)
    await expect(
      validateTemplateForPublishing({
        subject: "Hi",
        bodySource: source,
        categoryKind: "transactional",
      })
    ).rejects.toBe(appError)

    renderEmailTemplate.mockRejectedValueOnce(new Error("boom"))
    await expect(
      validateTemplateForPublishing({
        subject: "Hi",
        bodySource: source,
        categoryKind: "transactional",
      })
    ).rejects.toThrow("boom")
  })
})
