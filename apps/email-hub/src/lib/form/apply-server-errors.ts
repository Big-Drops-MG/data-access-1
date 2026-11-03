import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form"

import type { AppErrorDetail } from "@workspace/shared"

import { isApiError, type ApiError } from "@/lib/api-client"

export type ApplyServerErrorsResult = {
  /** True when at least one detail was attached to a form field. */
  fieldMapped: boolean
  /** Details that did not match a form field (shown as toast / banner). */
  unmapped: AppErrorDetail[]
}

function isFieldPath<TFieldValues extends FieldValues>(
  path: string,
  values: TFieldValues
): path is FieldPath<TFieldValues> {
  return Object.prototype.hasOwnProperty.call(values, path.split(".")[0] ?? "")
}

function shouldMapDetails(error: ApiError): boolean {
  return (
    error.code === "validation_failed" ||
    error.code === "conflict" ||
    error.status === 422 ||
    error.status === 409
  )
}

/**
 * Map API `details` onto RHF fields by `path` (SD#12.6).
 * Handles `validation_failed` and field-scoped `conflict` (e.g. duplicate domain name).
 * Unmatched details are returned as `unmapped` for toast / banner.
 */
export function applyServerErrors<TFieldValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFieldValues>,
  values: TFieldValues
): ApplyServerErrorsResult {
  if (!isApiError(error) || !shouldMapDetails(error)) {
    if (isApiError(error) && error.details.length > 0) {
      return { fieldMapped: false, unmapped: error.details }
    }
    return {
      fieldMapped: false,
      unmapped: isApiError(error)
        ? [{ path: "root", message: error.message }]
        : [{ path: "root", message: "Something went wrong" }],
    }
  }

  if (error.details.length === 0) {
    return {
      fieldMapped: false,
      unmapped: [{ path: "root", message: error.message }],
    }
  }

  const unmapped: AppErrorDetail[] = []
  let fieldMapped = false

  for (const detail of error.details) {
    const path = detail.path.trim()
    if (!path || path === "root" || !isFieldPath(path, values)) {
      unmapped.push(detail)
      continue
    }
    setError(path, { type: "server", message: detail.message })
    fieldMapped = true
  }

  if (!fieldMapped && unmapped.length === 0 && error.message) {
    unmapped.push({ path: "root", message: error.message })
  }

  return { fieldMapped, unmapped }
}

export function isValidationFailedError(
  error: unknown
): error is ApiError & { code: "validation_failed" } {
  return isApiError(error) && error.code === "validation_failed"
}
