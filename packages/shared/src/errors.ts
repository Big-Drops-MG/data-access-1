/**
 * API error codes and AppError (SD#10.1, SD#15.6).
 * Response shape: `{ error: { code, message, details } }`.
 */

export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "rate_limited",
  "internal",
  "unavailable",
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** Canonical HTTP status for each `error.code` (SD#10.1). */
export const ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal: 500,
  unavailable: 503,
} as const satisfies Record<ErrorCode, number>

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  bad_request: "Bad request",
  unauthorized: "Unauthorized",
  forbidden: "Forbidden",
  not_found: "Not found",
  conflict: "Conflict",
  validation_failed: "Validation failed",
  rate_limited: "Rate limited",
  internal: "Internal error",
  unavailable: "Service unavailable",
}

export type AppErrorDetail = {
  path: string
  message: string
}

export type AppErrorBody = {
  error: {
    code: ErrorCode
    message: string
    details: AppErrorDetail[]
  }
}

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value)
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details: AppErrorDetail[]

  /**
   * @param code — SD#10.1 `error.code`
   * @param status — HTTP status (defaults to the canonical status for `code`)
   * @param details — field-level details (e.g. Zod `{ path, message }` list)
   */
  constructor(
    code: ErrorCode,
    status: number = ERROR_STATUS[code],
    details: AppErrorDetail[] = []
  ) {
    super(ERROR_MESSAGES[code])
    this.name = "AppError"
    this.code = code
    this.status = status
    this.details = details
  }

  static badRequest(details: AppErrorDetail[] = []): AppError {
    return new AppError("bad_request", ERROR_STATUS.bad_request, details)
  }

  static unauthorized(details: AppErrorDetail[] = []): AppError {
    return new AppError("unauthorized", ERROR_STATUS.unauthorized, details)
  }

  static forbidden(details: AppErrorDetail[] = []): AppError {
    return new AppError("forbidden", ERROR_STATUS.forbidden, details)
  }

  static notFound(details: AppErrorDetail[] = []): AppError {
    return new AppError("not_found", ERROR_STATUS.not_found, details)
  }

  static conflict(details: AppErrorDetail[] = []): AppError {
    return new AppError("conflict", ERROR_STATUS.conflict, details)
  }

  static validationFailed(details: AppErrorDetail[]): AppError {
    return new AppError(
      "validation_failed",
      ERROR_STATUS.validation_failed,
      details
    )
  }

  static rateLimited(details: AppErrorDetail[] = []): AppError {
    return new AppError("rate_limited", ERROR_STATUS.rate_limited, details)
  }

  static internal(details: AppErrorDetail[] = []): AppError {
    return new AppError("internal", ERROR_STATUS.internal, details)
  }

  static unavailable(details: AppErrorDetail[] = []): AppError {
    return new AppError("unavailable", ERROR_STATUS.unavailable, details)
  }

  /** SD#10.1 error JSON body. */
  toJSON(): AppErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
