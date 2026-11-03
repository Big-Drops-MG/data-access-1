import { NextResponse } from "next/server"

import { getContextLogger, getRequestId } from "@workspace/logger"
import { AppError, isAppError } from "@workspace/shared"

import type { AppRole } from "@/lib/permissions"
import { serializeForRole } from "@/lib/serialize/for-role"

function stampRequestId(response: NextResponse): NextResponse {
  const requestId = getRequestId()
  if (requestId && response.headers.get("x-request-id") !== requestId) {
    response.headers.set("x-request-id", requestId)
  }
  return response
}

export function jsonAppError(error: AppError): NextResponse {
  const response = NextResponse.json(error.toJSON(), { status: error.status })
  if (error.code === "rate_limited") {
    response.headers.set("Retry-After", "60")
  }
  return stampRequestId(response)
}

export function toErrorResponse(error: unknown): NextResponse {
  if (isAppError(error)) {
    return jsonAppError(error)
  }
  getContextLogger().error(
    { event: "http.unhandled_error", err: error },
    "Unhandled request error"
  )
  return jsonAppError(AppError.internal())
}

/** JSON success body, with Viewer email masking when role is viewer. */
export function jsonForRole(
  role: AppRole,
  data: unknown,
  init?: { status?: number }
): NextResponse {
  return stampRequestId(
    NextResponse.json(serializeForRole(role, data), {
      status: init?.status ?? 200,
    })
  )
}
