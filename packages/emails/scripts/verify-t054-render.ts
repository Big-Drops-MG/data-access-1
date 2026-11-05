import { spawn } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"

import {
  buildUnsubscribeUrl,
  verifyUnsubscribeToken,
} from "../../shared/src/unsubscribe-token.js"

const TEST_ORIGIN = "http://127.0.0.1:3000"
const TEST_SECRET = "t054-test-unsubscribe-secret"
const MESSAGE_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"
const POSTAL_ADDRESS = "100 Factory Street, Austin, TX 78701"
const FIRST_NAME = "Ada"

const SAMPLE = `
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

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const evidenceDir = path.join(repoRoot, "tmp", "t054-evidence")
const lines: string[] = []
let failed = 0

function record(ok: boolean, label: string): void {
  if (!ok) {
    failed += 1
  }
  lines.push(`${ok ? "PASS" : "FAIL"}  ${label}`)
}

type RenderEmail = (input: {
  source: string
  subject?: string
  mergeData?: Record<string, string>
  unsubscribeUrl: string
  postalAddress: string
}) => Promise<{ html: string; text: string; subject: string }>

type RenderErrorClass = new (
  code: string,
  message: string
) => Error & { code: string }

async function rejects(
  render: RenderEmail,
  RenderError: RenderErrorClass,
  label: string,
  source: string
): Promise<void> {
  try {
    await render({
      source,
      unsubscribeUrl: buildUnsubscribeUrl({
        origin: TEST_ORIGIN,
        secret: TEST_SECRET,
        messageId: MESSAGE_ID,
      }),
      postalAddress: POSTAL_ADDRESS,
    })
    record(false, label)
  } catch (error) {
    record(error instanceof RenderError, label)
  }
}

async function main(): Promise<void> {
  try {
    await warmRenderWorker()
  } catch {
    record(false, "render worker module loaded")
  }
  const email = await import("../src/render-email.js")
  const host = await import("../src/render-worker-host.js")
  await settlePreloadedWorker()
  const { renderEmailTemplate } = email
  const unsubscribeUrl = buildUnsubscribeUrl({
    origin: TEST_ORIGIN,
    secret: TEST_SECRET,
    messageId: MESSAGE_ID,
  })
  const token = unsubscribeUrl.slice(`${TEST_ORIGIN}/unsubscribe/`.length)
  record(
    (() => {
      const verified = verifyUnsubscribeToken(TEST_SECRET, token)
      return verified.status === "valid" && verified.messageId === MESSAGE_ID
    })(),
    "signed unsubscribe URL verifies"
  )

  mkdirSync(evidenceDir, { recursive: true })
  const htmlPath = path.join(evidenceDir, "message.html")
  const textPath = path.join(evidenceDir, "message.txt")
  const rendered = await renderSample(
    renderEmailTemplate,
    email.TemplateRenderError,
    unsubscribeUrl
  )
  if (rendered) {
    record(
      rendered.subject === "Hello Ada" &&
        rendered.html.includes("Hello Ada") &&
        !rendered.html.includes("{{firstName}}"),
      "html renders firstName Ada"
    )
    record(
      rendered.text.includes("Hello Ada") &&
        rendered.text.includes(POSTAL_ADDRESS) &&
        rendered.text.includes(unsubscribeUrl),
      "plain text includes Ada, address, and unsubscribe URL"
    )
    record(
      rendered.html.includes(POSTAL_ADDRESS) &&
        rendered.html.includes(unsubscribeUrl),
      "html includes postal address and unsubscribe URL"
    )
    writeFileSync(htmlPath, rendered.html)
    writeFileSync(textPath, rendered.text)
  } else {
    record(false, "html renders firstName Ada")
    record(false, "plain text includes Ada, address, and unsubscribe URL")
    record(false, "html includes postal address and unsubscribe URL")
  }

  const sentinel = path.join(tmpdir(), `t054-sentinel-${Date.now()}.txt`)
  await rejects(
    renderEmailTemplate,
    email.TemplateRenderError,
    "rejects node:fs import",
    `import fs from "node:fs"
export default function Template() {
  fs.writeFileSync(${JSON.stringify(sentinel)}, "pwned")
  return null
}`
  )
  record(!existsSync(sentinel), "node:fs import did not create a file")
  await rejects(
    renderEmailTemplate,
    email.TemplateRenderError,
    "rejects node:http import",
    `import http from "node:http"
export default function Template() { return null }`
  )
  await rejects(
    renderEmailTemplate,
    email.TemplateRenderError,
    "rejects dynamic import()",
    `import("node:fs")`
  )
  await rejects(
    renderEmailTemplate,
    email.TemplateRenderError,
    "rejects while (true)",
    `while (true) {}`
  )
  await rejects(
    renderEmailTemplate,
    email.TemplateRenderError,
    "rejects fetch()",
    `fetch("https://example.com")`
  )
  await rejects(
    renderEmailTemplate,
    email.TemplateRenderError,
    "rejects process.env",
    `process.env.AWS_SECRET_ACCESS_KEY`
  )
  await rejects(
    renderEmailTemplate,
    email.TemplateRenderError,
    "rejects javascript: link",
    `<a href="javascript:alert(1)">open</a>`
  )
  await rejects(
    renderEmailTemplate,
    email.TemplateRenderError,
    "rejects onclick handler",
    `<p onclick="alert(1)">Hi</p>`
  )

  const started = Date.now()
  try {
    await host.runWorkerJob(
      { kind: "delay", ms: 60_000 },
      host.startRenderDeadline(),
      { holdReadyMs: 20_000 }
    )
    record(false, "timeout stops a render that exceeds 5 seconds")
  } catch (error) {
    const elapsed = Date.now() - started
    record(
      error instanceof email.TemplateRenderError &&
        error.code === "timeout" &&
        elapsed >= email.RENDER_TIMEOUT_MS - 250 &&
        elapsed < email.RENDER_TIMEOUT_MS + 3_000,
      `timeout stops at ${String(elapsed)}ms (limit ${String(email.RENDER_TIMEOUT_MS)}ms)`
    )
  }

  const resultsPath = path.join(evidenceDir, "results.txt")
  writeFileSync(resultsPath, `${lines.join("\n")}\n`)
  process.stdout.write(`${lines.join("\n")}\n`)
  process.stdout.write(`\nEvidence (gitignored):\n`)
  process.stdout.write(`  ${htmlPath}\n`)
  process.stdout.write(`  ${textPath}\n`)
  process.stdout.write(`  ${resultsPath}\n`)
  process.stdout.write(
    "Unsubscribe URL uses the local test origin. The signing secret was not printed.\n"
  )
  if (process.argv.includes("--open")) {
    if (existsSync(htmlPath)) {
      openHtml(htmlPath)
      process.stdout.write("Opened the HTML in the local browser.\n")
    } else {
      process.stdout.write(
        "HTML was not written, so the browser was not opened.\n"
      )
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}

async function renderSample(
  render: RenderEmail,
  RenderError: RenderErrorClass,
  unsubscribeUrl: string
) {
  try {
    return await render({
      source: SAMPLE,
      subject: "Hello {{firstName}}",
      mergeData: { firstName: FIRST_NAME, offerName: "Welcome Offer" },
      unsubscribeUrl,
      postalAddress: POSTAL_ADDRESS,
    })
  } catch (error) {
    record(false, `sample render: ${failureLabel(error, RenderError)}`)
    return null
  }
}

async function settlePreloadedWorker(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 5_500)
  })
}

async function warmRenderWorker(): Promise<void> {
  const compiled = new URL("../src/render-worker.js", import.meta.url)
  const workerUrl = existsSync(fileURLToPath(compiled))
    ? compiled
    : new URL("../src/render-worker.ts", import.meta.url)
  const env: Record<string, string> = {}
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "PATHEXT"]) {
    const value = process.env[key]
    if (value) {
      env[key] = value
    }
  }
  const worker = new Worker(workerUrl, {
    execArgv: [],
    resourceLimits: {
      maxOldGenerationSizeMb: 32,
      maxYoungGenerationSizeMb: 8,
      codeRangeSizeMb: 16,
      stackSizeMb: 4,
    },
    env,
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("warmup timed out"))
      }, 20_000)
      worker.once("message", () => {
        clearTimeout(timer)
        resolve()
      })
      worker.once("error", () => {
        clearTimeout(timer)
        reject(new Error("warmup failed"))
      })
    })
  } finally {
    await worker.terminate()
  }
}

function failureLabel(error: unknown, RenderError?: RenderErrorClass): string {
  if (RenderError && error instanceof RenderError) {
    return `${error.code}: ${error.message}`
  }
  return error instanceof Error ? error.name : "unknown error"
}

function openHtml(filePath: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", filePath], {
      detached: true,
      stdio: "ignore",
    }).unref()
    return
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open"
  spawn(command, [filePath], { detached: true, stdio: "ignore" }).unref()
}

try {
  await main()
} catch (error) {
  process.stdout.write(`FAIL  verification stopped: ${failureLabel(error)}\n`)
  process.exit(1)
}
