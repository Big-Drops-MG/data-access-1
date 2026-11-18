import { AppError } from "@workspace/shared"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"])

export function isStaffApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) {
    return false
  }
  if (pathname === "/api/health" || pathname === "/api/ready") {
    return false
  }
  if (pathname.startsWith("/api/ext/")) {
    return false
  }
  if (pathname.startsWith("/api/auth/")) {
    return false
  }
  if (pathname.startsWith("/api/u/")) {
    return false
  }
  return true
}

export function isMutatingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase())
}

export function resolveAppOrigin(
  authUrl: string | null | undefined = process.env.BETTER_AUTH_URL
): string | null {
  const raw = authUrl?.trim()
  if (!raw) {
    return null
  }
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

export function requestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin")?.trim()
  if (!origin) {
    return null
  }
  try {
    return new URL(origin).origin
  } catch {
    return null
  }
}

function requestUrlOrigin(request: Request): string | null {
  try {
    return new URL(request.url).origin
  } catch {
    return null
  }
}

export function effectiveRequestOrigin(
  request: Request,
  options: { strict?: boolean } = {}
): string | null {
  const fromHeader = requestOrigin(request)
  if (fromHeader) {
    return fromHeader
  }
  const strict = options.strict ?? process.env.VITEST !== "true"
  if (strict) {
    return null
  }
  return requestUrlOrigin(request)
}

export function originsMatch(
  request: Request,
  appOrigin: string | null | undefined,
  options: { strict?: boolean } = {}
): boolean {
  if (!appOrigin) {
    return false
  }
  const origin = effectiveRequestOrigin(request, options)
  return origin != null && origin === appOrigin
}

export function assertStaffRequestOrigin(
  request: Request,
  options: { appOrigin?: string | null; strict?: boolean } = {}
): void {
  if (!isMutatingMethod(request.method)) {
    return
  }

  let pathname: string
  try {
    pathname = new URL(request.url).pathname
  } catch {
    throw AppError.forbidden([
      { path: "origin", message: "Invalid request URL" },
    ])
  }

  if (!isStaffApiPath(pathname)) {
    return
  }

  const appOrigin =
    options.appOrigin !== undefined ? options.appOrigin : resolveAppOrigin()

  if (!appOrigin) {
    throw AppError.unavailable([
      {
        path: "origin",
        message: "App origin is not configured",
      },
    ])
  }

  if (!originsMatch(request, appOrigin, { strict: options.strict })) {
    throw AppError.forbidden([
      {
        path: "origin",
        message: "Origin header must match the application origin",
      },
    ])
  }
}

export function shouldRejectStaffOriginInProxy(
  method: string,
  pathname: string
): boolean {
  return isMutatingMethod(method) && isStaffApiPath(pathname)
}
