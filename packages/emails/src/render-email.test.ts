import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { RENDER_TIMEOUT_MS, renderEmailTemplate } from "./render-email.js"
import { runWorkerJob, startRenderDeadline } from "./render-worker-host.js"
import { TemplateRenderError } from "./template-render-error.js"

const UNSUBSCRIBE = "https://example.com/unsubscribe/alex"
const ADDRESS = "1 Market Street, San Francisco, CA 94105"

const OFFER = `
import { Html, Head, Body, Container, Text } from "@react-email/components"
export default function Template() {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Text>Hello {{firstName}}, your offer is {{offerName}}.</Text>
        </Container>
      </Body>
    </Html>
  )
}
`

function offer(
  mergeData: Record<string, string | number | boolean> = {
    firstName: "Alex",
    offerName: "Welcome Offer",
  }
) {
  return {
    source: OFFER,
    subject: "Hello {{firstName}}",
    mergeData,
    unsubscribeUrl: UNSUBSCRIBE,
    postalAddress: ADDRESS,
  }
}

describe("renderEmailTemplate", { timeout: 20_000 }, () => {
  it("renders a React Email template to html and text with merge data", async () => {
    const rendered = await renderEmailTemplate(offer())
    expect(rendered.subject).toBe("Hello Alex")
    expect(rendered.html).toContain("Hello Alex, your offer is Welcome Offer.")
    expect(rendered.text).toContain("Hello Alex, your offer is Welcome Offer.")
    expect(rendered.html).toContain(UNSUBSCRIBE)
    expect(rendered.text).toContain(UNSUBSCRIBE)
    expect(rendered.html).toContain(ADDRESS)
    expect(rendered.text).toContain(ADDRESS)
    expect(rendered.unsubscribeUrl).toBe(UNSUBSCRIBE)
    expect(rendered.html).not.toContain("{{firstName}}")
  })

  it("renders stored HTML without executing it", async () => {
    const rendered = await renderEmailTemplate({
      source: "<p>Hi Ada</p>",
      subject: "Hello",
      unsubscribeUrl: UNSUBSCRIBE,
      postalAddress: ADDRESS,
    })
    expect(rendered.html).toContain("Hi Ada")
    expect(rendered.text).toContain("Hi Ada")
    expect(rendered.html).not.toContain("<script")
  })

  it("renders the source it was given for each template version", async () => {
    const first = await renderEmailTemplate({
      source: "<p>Version one</p>",
      subject: "One",
      unsubscribeUrl: UNSUBSCRIBE,
      postalAddress: ADDRESS,
    })
    const second = await renderEmailTemplate({
      source: "<p>Version two</p>",
      subject: "Two",
      unsubscribeUrl: UNSUBSCRIBE,
      postalAddress: ADDRESS,
    })
    expect(first.html).toContain("Version one")
    expect(first.html).not.toContain("Version two")
    expect(second.html).toContain("Version two")
    expect(second.subject).toBe("Two")
    await expect(
      renderEmailTemplate({
        source: "   ",
        subject: "Missing",
        unsubscribeUrl: UNSUBSCRIBE,
        postalAddress: ADDRESS,
      })
    ).rejects.toMatchObject({ code: "unsupported_source" })
  })

  it("fails closed for missing, empty, and non-scalar merge values", async () => {
    await expect(
      renderEmailTemplate(offer({ firstName: "Alex" }))
    ).rejects.toMatchObject({
      code: "merge_data",
      message: "Missing merge tags: offerName",
    })
    await expect(
      renderEmailTemplate(offer({ firstName: "Alex", offerName: "  " }))
    ).rejects.toMatchObject({ code: "merge_data" })
    await expect(
      renderEmailTemplate({
        ...offer(),
        mergeData: { firstName: { bad: true } },
      })
    ).rejects.toBeInstanceOf(TemplateRenderError)
    await expect(
      renderEmailTemplate({
        ...offer(),
        mergeData: { firstName: { bad: true } },
      })
    ).rejects.toMatchObject({ code: "invalid_input" })
  })

  it("escapes merge values and keeps them out of other renders", async () => {
    const hostile = "<script>alert(1)</script>"
    const rendered = await renderEmailTemplate(
      offer({ firstName: hostile, offerName: "Welcome Offer" })
    )
    expect(rendered.html).not.toContain("<script>")
    expect(rendered.html).toContain("&lt;script&gt;")
    expect(rendered.text).toContain(hostile)

    const alex = await renderEmailTemplate(
      offer({ firstName: "Alex", offerName: "One" })
    )
    const blair = await renderEmailTemplate(
      offer({
        firstName: "Blair",
        offerName: "Two",
        secret: "not-in-the-template",
      })
    )
    expect(alex.html).toContain("Alex")
    expect(alex.html).not.toContain("Blair")
    expect(blair.html).toContain("Blair")
    expect(blair.html).not.toContain("Alex")
    expect(blair.html).not.toContain("not-in-the-template")
    expect(blair.text).not.toContain("not-in-the-template")
  })

  it("rejects syntax errors and imports outside the React Email allowlist", async () => {
    const sentinel = path.join(tmpdir(), `t054-sentinel-${Date.now()}.txt`)
    const cases = [
      `import { Text } from "@react-email/components"
export default function Template() { return <Text>Hello</Tex> }`,
      `import fs from "node:fs"
export default function Template() {
  fs.writeFileSync(${JSON.stringify(sentinel)}, "pwned")
  return null
}`,
      `import http from "node:http"
export default function Template() { return null }`,
      `import { exec } from "node:child_process"
export default function Template() { return null }`,
      `import("node:fs")`,
      `while (true) {}`,
      `fetch("https://example.com")`,
      `process.env.AWS_SECRET_ACCESS_KEY`,
      `<img src="file:///etc/passwd" alt="secret">`,
      `<a href="javascript:alert(1)">open</a>`,
      `<p onclick="alert(1)">Hi</p>`,
      `import { Text } from "@react-email/components"
export default function Template() {
  return <Text>{process.env.AWS_SECRET_ACCESS_KEY}</Text>
}`,
    ]
    for (const source of cases) {
      await expect(
        renderEmailTemplate({
          source,
          unsubscribeUrl: UNSUBSCRIBE,
          postalAddress: ADDRESS,
        })
      ).rejects.toBeInstanceOf(TemplateRenderError)
    }
    expect(existsSync(sentinel)).toBe(false)
  })

  it("rejects a missing unsubscribe URL or postal address", async () => {
    await expect(
      renderEmailTemplate({
        source: "<p>Hi</p>",
        unsubscribeUrl: " ",
        postalAddress: ADDRESS,
      })
    ).rejects.toMatchObject({ code: "compliance" })
    await expect(
      renderEmailTemplate({
        source: "<p>Hi</p>",
        unsubscribeUrl: "javascript:alert(1)",
        postalAddress: ADDRESS,
      })
    ).rejects.toMatchObject({ code: "compliance" })
    await expect(
      renderEmailTemplate({
        source: "<p>Hi</p>",
        unsubscribeUrl: UNSUBSCRIBE,
        postalAddress: " ",
      })
    ).rejects.toMatchObject({ code: "compliance" })
  })

  it("escapes the postal address in html and still shows it as text", async () => {
    const address = "1 Market <script>alert(1)</script>"
    const rendered = await renderEmailTemplate({
      source: "<p>Hi</p>",
      subject: "Hi",
      unsubscribeUrl: UNSUBSCRIBE,
      postalAddress: address,
    })
    expect(rendered.html).not.toContain("<script>")
    expect(rendered.text).toContain(address)
    expect(rendered.html).toContain(UNSUBSCRIBE)
  })
})

describe("render worker controls", { timeout: 20_000 }, () => {
  it("terminates a worker that exceeds the render timeout and then renders again", async () => {
    const started = Date.now()
    await expect(
      runWorkerJob({ kind: "delay", ms: 60_000 })
    ).rejects.toMatchObject({ code: "timeout" })
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(RENDER_TIMEOUT_MS - 250)
    expect(elapsed).toBeLessThan(RENDER_TIMEOUT_MS + 3_000)
    const rendered = await renderEmailTemplate({
      source: "<p>After timeout</p>",
      unsubscribeUrl: UNSUBSCRIBE,
      postalAddress: ADDRESS,
    })
    expect(rendered.text).toContain("After timeout")
  }, 15_000)

  it("includes worker startup in the 5 second deadline", async () => {
    const started = Date.now()
    await expect(
      runWorkerJob({ kind: "delay", ms: 60_000 }, startRenderDeadline(), {
        holdReadyMs: 20_000,
      })
    ).rejects.toMatchObject({ code: "timeout" })
    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(RENDER_TIMEOUT_MS - 250)
    expect(elapsed).toBeLessThan(RENDER_TIMEOUT_MS + 3_000)
  }, 12_000)

  it("reports a worker that fails before it is ready", async () => {
    await expect(
      runWorkerJob({ kind: "delay", ms: 1 }, startRenderDeadline(), {
        failInit: true,
      })
    ).rejects.toMatchObject({ code: "worker_crashed" })
    const rendered = await renderEmailTemplate({
      source: "<p>After init failure</p>",
      unsubscribeUrl: UNSUBSCRIBE,
      postalAddress: ADDRESS,
    })
    expect(rendered.text).toContain("After init failure")
  })

  it("reports a crashed worker and still renders the next template", async () => {
    await expect(runWorkerJob({ kind: "crash" })).rejects.toMatchObject({
      code: "worker_crashed",
    })
    const rendered = await renderEmailTemplate({
      source: "<p>After crash</p>",
      unsubscribeUrl: UNSUBSCRIBE,
      postalAddress: ADDRESS,
    })
    expect(rendered.text).toContain("After crash")
  })

  it("stops a worker that exceeds its memory limit", async () => {
    await expect(
      runWorkerJob(
        { kind: "allocate", megabytes: 30 },
        startRenderDeadline(30_000)
      )
    ).rejects.toMatchObject({ code: "worker_crashed" })
    const rendered = await renderEmailTemplate({
      source: "<p>After memory</p>",
      unsubscribeUrl: UNSUBSCRIBE,
      postalAddress: ADDRESS,
    })
    expect(rendered.text).toContain("After memory")
  }, 40_000)

  it("does not copy application secrets into the worker environment", async () => {
    const previous = process.env.AWS_SECRET_ACCESS_KEY
    process.env.AWS_SECRET_ACCESS_KEY = "t054-secret-value"
    try {
      const inspected = await runWorkerJob({ kind: "env" })
      expect(inspected.html).not.toContain("t054-secret-value")
    } finally {
      if (previous === undefined) {
        delete process.env.AWS_SECRET_ACCESS_KEY
      } else {
        process.env.AWS_SECRET_ACCESS_KEY = previous
      }
    }
  })
})
