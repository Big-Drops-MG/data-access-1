import { NextResponse } from "next/server"

import { AppError, isAppError } from "@workspace/shared"

import type { AppRole } from "@/lib/permissions"
import { serializeForRole } from "@/lib/serialize/for-role"

export function jsonAppError(error: AppError): NextResponse {
  const response = NextResponse.json(error.toJSON(), { status: error.status })
  if (error.code === "rate_limited") {
    response.headers.set("Retry-After", "60")
  }
  return response
}

export function toErrorResponse(error: unknown): NextResponse {
  if (isAppError(error)) {
    return jsonAppError(error)
  }
  return jsonAppError(AppError.internal())
}

/** JSON success body, with Viewer email masking when role is viewer. */
export function jsonForRole(
  role: AppRole,
  data: unknown,
  init?: { status?: number }
): NextResponse {
  return NextResponse.json(serializeForRole(role, data), {
    status: init?.status ?? 200,
  })
}
