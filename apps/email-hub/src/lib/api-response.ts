import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { getContextLogger, getRequestId } from "@workspace/logger"
import {
  AppError,
  appErrorFromPostgresConstraint,
  isAppError,
} from "@workspace/shared"

import type { AppRole } from "@/lib/permissions"
import { wasRequestErrorLogged } from "@/lib/request-error-log"
import { serializeForRole } from "@/lib/serialize/for-role"
import { zodIssuesToDetails } from "@/lib/zod-parse"

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

/** Map thrown values to SD#15.6 AppError (never includes stack traces). */
export function mapToAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error
  }
  if (error instanceof ZodError) {
    return AppError.validationFailed(zodIssuesToDetails(error))
  }
  const postgres = appErrorFromPostgresConstraint(error)
  if (postgres) {
    return postgres
  }
  return AppError.internal()
}

export function toErrorResponse(error: unknown): NextResponse {
  if (isAppError(error)) {
    return jsonAppError(error)
  }

  if (error instanceof ZodError) {
    return jsonAppError(AppError.validationFailed(zodIssuesToDetails(error)))
  }

  const postgres = appErrorFromPostgresConstraint(error)
  if (postgres) {
    return jsonAppError(postgres)
  }

  if (!wasRequestErrorLogged(error)) {
    getContextLogger().error(
      { event: "http.unhandled_error", err: error },
      "Unhandled request error"
    )
  }
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
