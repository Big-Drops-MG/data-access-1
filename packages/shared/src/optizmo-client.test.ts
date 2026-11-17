import { type Readable } from "node:stream"

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import {
  OPTIZMO_DEFAULT_BASE_URL,
  type OptizmoClientError,
  looksLikeFirstDownloadRefusal,
  prepareOptizmoDownload,
  streamOptizmoSuppressionFile,
} from "./optizmo-client.js"

const server = setupServer()

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

async function readStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

describe("optizmo-client", () => {
  it("detects first-download refusal messages", () => {
    expect(
      looksLikeFirstDownloadRefusal(403, "First download must be manual")
    ).toBe(true)
    expect(
      looksLikeFirstDownloadRefusal(403, "manual first download required")
    ).toBe(true)
    expect(looksLikeFirstDownloadRefusal(500, "First download")).toBe(false)
    expect(looksLikeFirstDownloadRefusal(403, "forbidden")).toBe(false)
  })

  it("prepares download then streams getfile via msw", async () => {
    const key = "m-test-key"
    let sawToken = false
    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`,
        ({ request }) => {
          const url = new URL(request.url)
          sawToken = url.searchParams.get("token") === "api-secret"
          return HttpResponse.text("ok")
        }
      ),
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}`, () =>
        HttpResponse.text("email\na@example.com\nb@example.com\n")
      )
    )

    await prepareOptizmoDownload(key, { apiKey: "api-secret" })
    expect(sawToken).toBe(true)

    const stream = await streamOptizmoSuppressionFile(key, {
      apiKey: "api-secret",
    })
    expect(await readStream(stream)).toContain("a@example.com")
  })

  it("normalizes trailing slashes on baseUrl", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.text("ok")
      )
    )
    await expect(
      prepareOptizmoDownload(key, {
        apiKey: "api-secret",
        baseUrl: `${OPTIZMO_DEFAULT_BASE_URL}/`,
      })
    ).resolves.toBeUndefined()
  })

  it("maps first-download refusal without retry", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.text("This campaign requires a first download manually", {
          status: 403,
        })
      )
    )

    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({
      code: "first_download_manual",
      retryable: false,
    } satisfies Partial<OptizmoClientError>)
  })

  it("maps retryable prepare HTTP failures", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.text("busy", { status: 503 })
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({
      code: "http",
      retryable: true,
      status: 503,
    })
  })

  it("rejects missing api key and invalid mailer keys", async () => {
    await expect(
      prepareOptizmoDownload("m-test-key", { apiKey: "   " })
    ).rejects.toMatchObject({ code: "config" })
    await expect(
      prepareOptizmoDownload("../etc/passwd", { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_key" })
  })

  it("maps getfile first-download and retryable errors", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}`, () =>
        HttpResponse.text("First download must be manual", { status: 403 })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({
      code: "first_download_manual",
      retryable: false,
    })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}`, () =>
        HttpResponse.text("rate limited", { status: 429 })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({
      code: "http",
      retryable: true,
      status: 429,
    })
  })

  it("rejects oversized content-length before reading body", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}`, () =>
        HttpResponse.text("x".repeat(100), {
          headers: {
            "content-length": "999999",
          },
        })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(key, {
        apiKey: "api-secret",
        maxFileBytes: 50,
      })
    ).rejects.toMatchObject({ code: "too_large", retryable: false })
  })

  it("rejects streams that exceed maxFileBytes while reading", async () => {
    const key = "m-test-key"
    const body = "abcdefghijklmnopqrstuvwxyz"
    const stream = await streamOptizmoSuppressionFile(key, {
      apiKey: "api-secret",
      maxFileBytes: 10,
      fetchImpl: async () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    })
    await expect(readStream(stream)).rejects.toMatchObject({
      code: "too_large",
    })
  })
})
