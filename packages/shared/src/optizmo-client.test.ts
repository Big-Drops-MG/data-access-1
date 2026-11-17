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

describe("optizmo-client", () => {
  it("detects first-download refusal messages", () => {
    expect(
      looksLikeFirstDownloadRefusal(403, "First download must be manual")
    ).toBe(true)
    expect(looksLikeFirstDownloadRefusal(500, "First download")).toBe(false)
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
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    expect(Buffer.concat(chunks).toString("utf8")).toContain("a@example.com")
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

  it("rejects invalid mailer access keys", async () => {
    await expect(
      prepareOptizmoDownload("../etc/passwd", { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_key" })
  })
})
