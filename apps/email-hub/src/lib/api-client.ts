import {
  isErrorCode,
  type AppErrorDetail,
  type ErrorCode,
} from "@workspace/shared"

import { redirectToLogin } from "@/lib/auth-redirect"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: ErrorCode | string,
    readonly requestId?: string,
    readonly details: AppErrorDetail[] = []
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isConflictError(error: unknown): error is ApiError {
  return (
    isApiError(error) && (error.status === 409 || error.code === "conflict")
  )
}

type ErrorBody = {
  error?: {
    code?: string
    message?: string
    details?: AppErrorDetail[]
  }
}

async function readErrorBody(response: Response): Promise<ErrorBody | null> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    return null
  }
  try {
    return (await response.json()) as ErrorBody
  } catch {
    return null
  }
}

function currentReturnPath(): string {
  if (typeof window === "undefined") {
    return "/dashboard"
  }
  return `${window.location.pathname}${window.location.search}`
}

/**
 * Browser fetch wrapper (SD#10.1 / SD#12.4 / T-050).
 * Parses `{ error: { code, message, details } }` into `ApiError`.
 * 401 redirects to `/login?next=…`.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init?.credentials ?? "same-origin",
  })

  if (response.ok) {
    return response
  }

  const requestId = response.headers.get("x-request-id") ?? undefined
  const body = await readErrorBody(response)
  const codeRaw = body?.error?.code
  const code =
    typeof codeRaw === "string" && isErrorCode(codeRaw) ? codeRaw : codeRaw
  const message =
    body?.error?.message?.trim() ||
    response.statusText ||
    `Request failed (${response.status})`
  const details = Array.isArray(body?.error?.details) ? body.error.details : []

  if (response.status === 401) {
    redirectToLogin(currentReturnPath())
  }

  throw new ApiError(message, response.status, code, requestId, details)
}

/** `apiFetch` then parse JSON (empty body → `undefined`). */
export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await apiFetch(input, init)
  if (response.status === 204) {
    return undefined as T
  }
  const text = await response.text()
  if (!text) {
    return undefined as T
  }
  return JSON.parse(text) as T
}
