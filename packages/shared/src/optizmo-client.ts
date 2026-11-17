import { Readable, Transform } from "node:stream"
import type { ReadableStream as WebReadableStream } from "node:stream/web"

export const OPTIZMO_DEFAULT_BASE_URL = "https://mailer-api.optizmo.net"
export const OPTIZMO_HTTP_TIMEOUT_MS = 10_000
export const OPTIZMO_GETFILE_TIMEOUT_MS = 10 * 60_000
export const OPTIZMO_MAX_FILE_BYTES = 200 * 1024 * 1024

const MAILER_ACCESS_KEY_PATTERN = /^[A-Za-z0-9._-]{1,256}$/

export class OptizmoClientError extends Error {
  readonly code:
    | "config"
    | "http"
    | "first_download_manual"
    | "empty"
    | "too_large"
    | "invalid_key"
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
  const lowered = body.toLowerCase()
  return (
    lowered.includes("first download") ||
    lowered.includes("first-download") ||
    lowered.includes("manual download") ||
    lowered.includes("downloaded manually") ||
    lowered.includes("must download manually")
  )
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 2_000)
  } catch {
    return ""
  }
}

export async function prepareOptizmoDownload(
  mailerAccessKey: string,
  deps: OptizmoClientDeps
): Promise<void> {
  const apiKey = deps.apiKey.trim()
  if (!apiKey) {
    throw new OptizmoClientError("config", "OPTIZMO_API_KEY is not configured")
  }
  const key = assertMailerAccessKey(mailerAccessKey)
  const base = normalizeBaseUrl(deps.baseUrl)
  const url = new URL(`${base}/accesskey/download/${encodeURIComponent(key)}`)
  url.searchParams.set("token", apiKey)

  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs = deps.prepareTimeoutMs ?? OPTIZMO_HTTP_TIMEOUT_MS
  const response = await fetchImpl(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (response.ok) {
    return
  }

  const body = await readErrorBody(response)
  if (looksLikeFirstDownloadRefusal(response.status, body)) {
    throw new OptizmoClientError(
      "first_download_manual",
      "Optizmo requires a manual first download for this mailer access key",
      { status: response.status, retryable: false }
    )
  }

  const retryable = response.status === 429 || response.status >= 500
  throw new OptizmoClientError(
    "http",
    `Optizmo prepare download failed with HTTP ${String(response.status)}`,
    { status: response.status, retryable }
  )
}

export async function streamOptizmoSuppressionFile(
  mailerAccessKey: string,
  deps: OptizmoClientDeps
): Promise<Readable> {
  const key = assertMailerAccessKey(mailerAccessKey)
  const base = normalizeBaseUrl(deps.baseUrl)
  const url = `${base}/accesskey/getfile/${encodeURIComponent(key)}`
  const fetchImpl = deps.fetchImpl ?? fetch
  const timeoutMs = deps.getFileTimeoutMs ?? OPTIZMO_GETFILE_TIMEOUT_MS
  const maxBytes = deps.maxFileBytes ?? OPTIZMO_MAX_FILE_BYTES

  const response = await fetchImpl(url, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const body = await readErrorBody(response)
    if (looksLikeFirstDownloadRefusal(response.status, body)) {
      throw new OptizmoClientError(
        "first_download_manual",
        "Optizmo requires a manual first download for this mailer access key",
        { status: response.status, retryable: false }
      )
    }
    const retryable = response.status === 429 || response.status >= 500
    throw new OptizmoClientError(
      "http",
      `Optizmo getfile failed with HTTP ${String(response.status)}`,
      { status: response.status, retryable }
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

  let bytesRead = 0
  const upstream = Readable.fromWeb(response.body as WebReadableStream)
  const limiter = new Transform({
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
  return upstream.pipe(limiter)
}
