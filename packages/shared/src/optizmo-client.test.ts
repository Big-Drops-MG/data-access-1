import { deflateRawSync } from "node:zlib"
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
  unzipOptizmoSuppressionStream,
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

function buildZip(entryName: string, content: string): Buffer {
  const name = Buffer.from(entryName, "utf8")
  const raw = Buffer.from(content, "utf8")
  const compressed = deflateRawSync(raw)
  const local = Buffer.alloc(30 + name.length)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(8, 8)
  local.writeUInt16LE(0, 10)
  local.writeUInt16LE(0, 12)
  local.writeUInt32LE(0, 14)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(raw.length, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(0, 28)
  name.copy(local, 30)

  const central = Buffer.alloc(46 + name.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0, 14)
  central.writeUInt32LE(0, 16)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt16LE(0, 30)
  central.writeUInt16LE(0, 32)
  central.writeUInt16LE(0, 34)
  central.writeUInt16LE(0, 36)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(0, 42)
  name.copy(central, 46)

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(local.length + compressed.length, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([local, compressed, central, end])
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

  it("passes format=md5 and deltas query params when requested", async () => {
    const key = "m-test-key"
    let query = ""
    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`,
        ({ request }) => {
          const url = new URL(request.url)
          query = url.search
          return HttpResponse.json({
            result: "success",
            format: "md5",
            campaign_name: "Test",
            download_link: `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}?token=t&dcma=d`,
            optout_link: "https://example.com/o",
            delta_timestamp: 99,
            help: "ok",
          })
        }
      )
    )
    await prepareOptizmoDownload(key, {
      apiKey: "api-secret",
      format: "md5",
      deltas: 1,
      deltaTimestamp: 1546300800,
    })
    expect(query).toContain("format=md5")
    expect(query).toContain("deltas=1")
    expect(query).toContain("delta_timestamp=1546300800")
  })

  it("prepares download and streams the returned download_link ZIP", async () => {
    const key = "m-test-key"
    const downloadLink = `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}?token=api-secret&dcma=abc`
    let sawToken = false
    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`,
        ({ request }) => {
          const url = new URL(request.url)
          sawToken = url.searchParams.get("token") === "api-secret"
          return HttpResponse.json({
            result: "success",
            format: "md5",
            campaign_name: "Test",
            download_link: downloadLink,
            optout_link: "https://example.com/o",
            delta_timestamp: 123,
            help: "Use the download_link",
          })
        }
      ),
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}`, () => {
        const zip = buildZip(
          "list-MD5.txt",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n"
        )
        return new HttpResponse(zip, {
          status: 200,
          headers: { "content-type": "application/zip" },
        })
      })
    )

    const prepared = await prepareOptizmoDownload(key, { apiKey: "api-secret" })
    expect(sawToken).toBe(true)
    expect(prepared).toMatchObject({
      downloadLink,
      format: "md5",
      deltaTimestamp: 123,
    })

    const stream = await streamOptizmoSuppressionFile(prepared.downloadLink, {
      apiKey: "api-secret",
    })
    expect(await readStream(stream)).toContain(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    )
  })

  it("maps JSON error bodies that return HTTP 200", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json({
          result: "error",
          error_code: "no_auth_token",
          error: "No Auth Token",
          help: "Provide token",
        })
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({
      code: "http",
      message: expect.stringContaining("No Auth Token"),
    })
  })

  it("normalizes trailing slashes on baseUrl", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json({
          result: "success",
          format: "plain",
          campaign_name: "Test",
          download_link: `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}?token=x&dcma=y`,
          optout_link: "https://example.com/o",
          delta_timestamp: 1,
          help: "ok",
        })
      )
    )
    await expect(
      prepareOptizmoDownload(key, {
        apiKey: "api-secret",
        baseUrl: `${OPTIZMO_DEFAULT_BASE_URL}/`,
      })
    ).resolves.toMatchObject({ format: "plain" })
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

  it("rejects unsafe download_link hosts", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json({
          result: "success",
          format: "md5",
          campaign_name: "Test",
          download_link:
            "https://evil.example/accesskey/getfile/x?token=1&dcma=2",
          optout_link: "https://example.com/o",
          delta_timestamp: 1,
          help: "ok",
        })
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_response" })
  })

  it("maps getfile JSON errors returned as HTTP 200", async () => {
    const link = `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key?token=t&dcma=d`
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key`, () =>
        HttpResponse.json({
          result: "error",
          error_code: "download_not_prepared",
          error: "This list has not been prepared for download.",
          help: "Prepare first",
        })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(link, { apiKey: "api-secret" })
    ).rejects.toMatchObject({
      code: "http",
      message: expect.stringContaining("not been prepared"),
    })
  })

  it("rejects oversized content-length before reading body", async () => {
    const link = `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key?token=t&dcma=d`
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key`, () =>
        HttpResponse.text("x".repeat(100), {
          headers: {
            "content-length": "999999",
            "content-type": "text/plain",
          },
        })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(link, {
        apiKey: "api-secret",
        maxFileBytes: 50,
      })
    ).rejects.toMatchObject({ code: "too_large", retryable: false })
  })

  it("unzips a single txt entry from a zip stream", async () => {
    const zip = buildZip("out.txt", "a@example.com\n")
    const { Readable } = await import("node:stream")
    const stream = unzipOptizmoSuppressionStream(Readable.from([zip]))
    expect(await readStream(stream)).toBe("a@example.com\n")
  })

  it("covers prepare edge cases for format, body, and link validation", async () => {
    const key = "m-test-key"
    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`,
        ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get("format")).toBe("md5")
          return HttpResponse.json({
            result: "success",
            format: "weird",
            campaign_name: "Test",
            download_link: `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${key}?token=t&dcma=d`,
            optout_link: "https://example.com/o",
            delta_timestamp: "not-a-number",
            help: "ok",
          })
        }
      )
    )
    await expect(
      prepareOptizmoDownload(key, {
        apiKey: "api-secret",
        format: "md5",
        baseUrl: "   ",
      })
    ).resolves.toMatchObject({
      format: "md5",
      deltaTimestamp: null,
    })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.text("not-json-at-all")
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_response" })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json({
          result: "success",
          format: "md5",
          campaign_name: "Test",
          optout_link: "https://example.com/o",
          delta_timestamp: 1,
          help: "ok",
        })
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_response" })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json({
          result: "success",
          format: "md5",
          campaign_name: "Test",
          download_link: "not a url",
          optout_link: "https://example.com/o",
          delta_timestamp: 1,
          help: "ok",
        })
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_response" })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json({
          result: "success",
          format: "md5",
          campaign_name: "Test",
          download_link: `http://mailer-api.optizmo.net/accesskey/getfile/${key}?token=t&dcma=d`,
          optout_link: "https://example.com/o",
          delta_timestamp: 1,
          help: "ok",
        })
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_response" })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json({
          result: "success",
          format: "md5",
          campaign_name: "Test",
          download_link: `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/other/${key}?token=t&dcma=d`,
          optout_link: "https://example.com/o",
          delta_timestamp: 1,
          help: "ok",
        })
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_response" })
  })

  it("maps prepare HTTP failures including JSON and plain bodies", async () => {
    const key = "m-test-key"
    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json(
          {
            result: "error",
            error_code: "first-download-required",
            error: "Blocked",
            help: "manual first download required",
          },
          { status: 409 }
        )
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "first_download_manual", retryable: false })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.json(
          { result: "error", error_code: "quota", error: 12 },
          { status: 429 }
        )
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({
      code: "http",
      retryable: true,
      message: "Optizmo request failed",
    })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${key}`, () =>
        HttpResponse.text("nope", { status: 400 })
      )
    )
    await expect(
      prepareOptizmoDownload(key, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "http", retryable: false, status: 400 })
  })

  it("covers getfile HTTP, empty, JSON-non-error, and plain text paths", async () => {
    const link = `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key?token=t&dcma=d`

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key`, () =>
        HttpResponse.text("First download must be manual", { status: 403 })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(link, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "first_download_manual" })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key`, () =>
        HttpResponse.text("busy", { status: 503 })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(link, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "http", retryable: true, status: 503 })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key`, () =>
        HttpResponse.json({ result: "success", note: "unexpected" })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(link, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "invalid_response" })

    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key`,
        () =>
          new HttpResponse(null, {
            status: 200,
            headers: { "content-type": "text/plain" },
          })
      )
    )
    await expect(
      streamOptizmoSuppressionFile(link, { apiKey: "api-secret" })
    ).rejects.toMatchObject({ code: "empty" })

    server.use(
      http.get(`${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key`, () =>
        HttpResponse.text("a@example.com\n", {
          headers: { "content-type": "text/plain" },
        })
      )
    )
    const plain = await streamOptizmoSuppressionFile(link, {
      apiKey: "api-secret",
    })
    expect(await readStream(plain)).toContain("a@example.com")
  })

  it("rejects zip archives without a txt/csv entry and skips non-list files", async () => {
    const { Readable } = await import("node:stream")
    const readmeOnly = buildZip("readme.md", "ignore me\n")
    const emptyZipStream = unzipOptizmoSuppressionStream(
      Readable.from([readmeOnly])
    )
    await expect(readStream(emptyZipStream)).rejects.toMatchObject({
      code: "empty",
    })

    const withExtra = Buffer.concat([buildZip("notes.bin", "binary")])
    void withExtra
    const listZip = buildZip(
      "suppression.txt",
      "deadbeefdeadbeefdeadbeefdeadbeef\n"
    )
    const stream = unzipOptizmoSuppressionStream(Readable.from([listZip]))
    expect(await readStream(stream)).toContain(
      "deadbeefdeadbeefdeadbeefdeadbeef"
    )
  })

  it("rejects streams that exceed maxFileBytes while reading", async () => {
    const link = `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/m-test-key?token=t&dcma=d`
    const body = "abcdefghijklmnopqrstuvwxyz"
    const stream = await streamOptizmoSuppressionFile(link, {
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
