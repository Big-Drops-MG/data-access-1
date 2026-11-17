import { Readable, Transform } from "node:stream"
import type { ReadableStream as WebReadableStream } from "node:stream/web"

import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate"

export const OPTIZMO_DEFAULT_BASE_URL = "https://mailer-api.optizmo.net"
export const OPTIZMO_HTTP_TIMEOUT_MS = 10_000
export const OPTIZMO_GETFILE_TIMEOUT_MS = 10 * 60_000
export const OPTIZMO_MAX_FILE_BYTES = 200 * 1024 * 1024

const MAILER_ACCESS_KEY_PATTERN = /^[A-Za-z0-9._-]{1,256}$/
const DOWNLOAD_LINK_HOST = "mailer-api.optizmo.net"

export class OptizmoClientError extends Error {
  readonly code:
    | "config"
    | "http"
    | "first_download_manual"
    | "empty"
    | "too_large"
    | "invalid_key"
    | "invalid_response"
  readonly status?: number
  readonly retryable: boolean

  constructor(
    code: OptizmoClientError["code"],
    message: string,
    options?: { status?: number; retryable?: boolean; cause?: unknown }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined)
    this.name = "OptizmoClientError"
    this.code = code
    this.status = options?.status
    this.retryable = options?.retryable ?? false
  }
}

export type OptizmoFetch = (
  url: string,
  init?: RequestInit
) => Promise<Response>

export type OptizmoClientDeps = {
  apiKey: string
  baseUrl?: string
  fetchImpl?: OptizmoFetch
  prepareTimeoutMs?: number
  getFileTimeoutMs?: number
  maxFileBytes?: number
  format?: "plain" | "md5"
  deltas?: 0 | 1
  deltaTimestamp?: number
}

export type OptizmoPrepareResult = {
  downloadLink: string
  format: "plain" | "md5"
  deltaTimestamp: number | null
}

function assertMailerAccessKey(mailerAccessKey: string): string {
  const trimmed = mailerAccessKey.trim()
  if (!MAILER_ACCESS_KEY_PATTERN.test(trimmed)) {
    throw new OptizmoClientError(
      "invalid_key",
      "Invalid Optizmo mailer access key format"
    )
  }
  return trimmed
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  const raw = (baseUrl ?? OPTIZMO_DEFAULT_BASE_URL).trim()
  if (!raw) {
    return OPTIZMO_DEFAULT_BASE_URL
  }
  return raw.replace(/\/+$/, "")
}

export function looksLikeFirstDownloadRefusal(
  status: number,
  body: string
): boolean {
  if (status !== 400 && status !== 403 && status !== 409 && status !== 422) {
    return false
  }
  return bodyMentionsFirstDownload(body)
}

function bodyMentionsFirstDownload(body: string): boolean {
  const lowered = body.toLowerCase()
  return (
    lowered.includes("first download") ||
    lowered.includes("first-download") ||
    lowered.includes("manual download") ||
    lowered.includes("downloaded manually") ||
    lowered.includes("must download manually") ||
    lowered.includes("manually downloaded the first time")
  )
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 2_000)
  } catch {
    return ""
  }
}

function mapOptizmoJsonError(
  body: string,
  status: number
): OptizmoClientError | null {
  let parsed: {
    result?: unknown
    error?: unknown
    error_code?: unknown
    help?: unknown
  }
  try {
    parsed = JSON.parse(body) as typeof parsed
  } catch {
    return null
  }
  if (parsed.result !== "error") {
    return null
  }

  const messageParts = [
    typeof parsed.error === "string" ? parsed.error : null,
    typeof parsed.help === "string" ? parsed.help : null,
  ].filter(Boolean)
  const message =
    messageParts.join(" — ").slice(0, 500) || "Optizmo request failed"

  if (
    bodyMentionsFirstDownload(message) ||
    (typeof parsed.error_code === "string" &&
      bodyMentionsFirstDownload(parsed.error_code))
  ) {
    return new OptizmoClientError("first_download_manual", message, {
      status,
      retryable: false,
    })
  }

  const retryable = status === 429 || status >= 500
  return new OptizmoClientError("http", message, { status, retryable })
}

function assertSafeDownloadLink(downloadLink: string, baseUrl: string): string {
  let url: URL
  try {
    url = new URL(downloadLink)
  } catch (error) {
    throw new OptizmoClientError(
      "invalid_response",
      "Optizmo prepare returned an invalid download_link",
      { cause: error, retryable: false }
    )
  }

  const allowed = new Set([
    new URL(baseUrl).host.toLowerCase(),
    DOWNLOAD_LINK_HOST,
  ])
  if (!allowed.has(url.host.toLowerCase())) {
    throw new OptizmoClientError(
      "invalid_response",
      "Optizmo download_link host is not allowed",
      { retryable: false }
    )
  }
  if (url.protocol !== "https:") {
    throw new OptizmoClientError(
      "invalid_response",
      "Optizmo download_link must use https",
      { retryable: false }
    )
  }
  if (!url.pathname.includes("/accesskey/getfile/")) {
    throw new OptizmoClientError(
      "invalid_response",
      "Optizmo download_link path is not a getfile URL",
      { retryable: false }
    )
  }
  return url.toString()
}

export async function prepareOptizmoDownload(
  mailerAccessKey: string,
  deps: OptizmoClientDeps
): Promise<OptizmoPrepareResult> {
  const apiKey = deps.apiKey.trim()
  if (!apiKey) {
    throw new OptizmoClientError("config", "OPTIZMO_API_KEY is not configured")
  }
  const key = assertMailerAccessKey(mailerAccessKey)
  const base = normalizeBaseUrl(deps.baseUrl)
  const url = new URL(`${base}/accesskey/download/${encodeURIComponent(key)}`)
  url.searchParams.set("token", apiKey)
  if (deps.format) {
    url.searchParams.set("format", deps.format)
  }
  if (deps.deltas === 1) {
    url.searchParams.set("deltas", "1")
    if (
      typeof deps.deltaTimestamp === "number" &&
      Number.isFinite(deps.deltaTimestamp)
    ) {
      url.searchParams.set("delta_timestamp", String(deps.deltaTimestamp))
    }
  }

  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs = deps.prepareTimeoutMs ?? OPTIZMO_HTTP_TIMEOUT_MS
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  })

  const body = await readErrorBody(response)
  if (!response.ok) {
    if (looksLikeFirstDownloadRefusal(response.status, body)) {
      throw new OptizmoClientError(
        "first_download_manual",
        "Optizmo requires a manual first download for this mailer access key",
        { status: response.status, retryable: false }
      )
    }
    const jsonError = mapOptizmoJsonError(body, response.status)
    if (jsonError) {
      throw jsonError
    }
    const retryable = response.status === 429 || response.status >= 500
    throw new OptizmoClientError(
      "http",
      `Optizmo prepare download failed with HTTP ${String(response.status)}`,
      { status: response.status, retryable }
    )
  }

  const jsonError = mapOptizmoJsonError(body, response.status)
  if (jsonError) {
    throw jsonError
  }

  let parsed: {
    result?: unknown
    download_link?: unknown
    format?: unknown
    delta_timestamp?: unknown
  }
  try {
    parsed = JSON.parse(body) as typeof parsed
  } catch (error) {
    throw new OptizmoClientError(
      "invalid_response",
      "Optizmo prepare returned non-JSON body",
      { status: response.status, retryable: false, cause: error }
    )
  }

  if (parsed.result !== "success" || typeof parsed.download_link !== "string") {
    throw new OptizmoClientError(
      "invalid_response",
      "Optizmo prepare response missing download_link",
      { status: response.status, retryable: false }
    )
  }

  const format =
    parsed.format === "plain" || parsed.format === "md5"
      ? parsed.format
      : (deps.format ?? "md5")
  const deltaTimestamp =
    typeof parsed.delta_timestamp === "number" &&
    Number.isFinite(parsed.delta_timestamp)
      ? parsed.delta_timestamp
      : null

  return {
    downloadLink: assertSafeDownloadLink(parsed.download_link, base),
    format,
    deltaTimestamp,
  }
}

function createByteLimiter(maxBytes: number): {
  transform: Transform
  getBytesRead: () => number
} {
  let bytesRead = 0
  const transform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesRead += chunk.length
      if (bytesRead > maxBytes) {
        callback(
          new OptizmoClientError(
            "too_large",
            `Optizmo suppression file exceeds ${String(maxBytes)} bytes`,
            { retryable: false }
          )
        )
        return
      }
      callback(null, chunk)
    },
  })
  return { transform, getBytesRead: () => bytesRead }
}

export function unzipOptizmoSuppressionStream(
  zipStream: NodeJS.ReadableStream
): Readable {
  const output = new Readable({
    read() {},
  })

  let selected = false
  let finished = false
  const unzip = new Unzip((file) => {
    if (selected) {
      file.terminate()
      return
    }
    const name = file.name.toLowerCase()
    if (!name.endsWith(".txt") && !name.endsWith(".csv")) {
      file.terminate()
      return
    }
    selected = true
    file.ondata = (err, data, final) => {
      if (err) {
        output.destroy(
          new OptizmoClientError(
            "invalid_response",
            "Failed to inflate Optizmo suppression ZIP entry",
            { cause: err, retryable: false }
          )
        )
        return
      }
      if (data.length > 0) {
        output.push(Buffer.from(data))
      }
      if (final) {
        finished = true
        output.push(null)
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)

  zipStream.on("data", (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    try {
      unzip.push(buf, false)
    } catch (error) {
      output.destroy(
        error instanceof Error
          ? error
          : new OptizmoClientError(
              "invalid_response",
              "Failed to parse Optizmo ZIP",
              { cause: error, retryable: false }
            )
      )
    }
  })
  zipStream.on("error", (error) => {
    output.destroy(error)
  })
  zipStream.on("end", () => {
    try {
      unzip.push(new Uint8Array(0), true)
    } catch (error) {
      output.destroy(
        error instanceof Error
          ? error
          : new OptizmoClientError(
              "invalid_response",
              "Failed to finalize Optizmo ZIP",
              { cause: error, retryable: false }
            )
      )
      return
    }
    if (!selected && !output.destroyed) {
      output.destroy(
        new OptizmoClientError(
          "empty",
          "Optizmo ZIP did not contain a suppression text file",
          { retryable: false }
        )
      )
      return
    }
    if (selected && !finished && !output.destroyed) {
      finished = true
      output.push(null)
    }
  })

  return output
}

export async function streamOptizmoSuppressionFile(
  downloadLink: string,
  deps: OptizmoClientDeps
): Promise<Readable> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs = deps.getFileTimeoutMs ?? OPTIZMO_GETFILE_TIMEOUT_MS
  const maxBytes = deps.maxFileBytes ?? OPTIZMO_MAX_FILE_BYTES
  const safeLink = assertSafeDownloadLink(
    downloadLink,
    normalizeBaseUrl(deps.baseUrl)
  )

  const response = await fetchImpl(safeLink, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  })

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase()

  if (!response.ok) {
    const body = await readErrorBody(response)
    if (looksLikeFirstDownloadRefusal(response.status, body)) {
      throw new OptizmoClientError(
        "first_download_manual",
        "Optizmo requires a manual first download for this mailer access key",
        { status: response.status, retryable: false }
      )
    }
    const jsonError = mapOptizmoJsonError(body, response.status)
    if (jsonError) {
      throw jsonError
    }
    const retryable = response.status === 429 || response.status >= 500
    throw new OptizmoClientError(
      "http",
      `Optizmo getfile failed with HTTP ${String(response.status)}`,
      { status: response.status, retryable }
    )
  }

  if (contentType.includes("application/json")) {
    const body = await readErrorBody(response)
    const jsonError = mapOptizmoJsonError(body, response.status)
    if (jsonError) {
      throw jsonError
    }
    throw new OptizmoClientError(
      "invalid_response",
      "Optizmo getfile returned JSON instead of a suppression file",
      { status: response.status, retryable: false }
    )
  }

  const contentLength = response.headers.get("content-length")
  if (contentLength) {
    const size = Number(contentLength)
    if (Number.isFinite(size) && size > maxBytes) {
      throw new OptizmoClientError(
        "too_large",
        `Optizmo suppression file exceeds ${String(maxBytes)} bytes`,
        { retryable: false }
      )
    }
  }

  if (!response.body) {
    throw new OptizmoClientError(
      "empty",
      "Optizmo getfile returned an empty body",
      { retryable: false }
    )
  }

  const upstream = Readable.fromWeb(response.body as WebReadableStream)
  const { transform: limiter } = createByteLimiter(maxBytes)
  const limited = upstream.pipe(limiter)

  if (
    contentType.includes("zip") ||
    contentType.includes("octet-stream") ||
    contentType === ""
  ) {
    return unzipOptizmoSuppressionStream(limited)
  }

  return limited
}
