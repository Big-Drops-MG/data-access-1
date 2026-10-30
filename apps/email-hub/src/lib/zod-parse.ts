import type { z } from "zod"

import { AppError, type AppErrorDetail } from "@workspace/shared"

/** Map a Zod failure to SD#10.1 `validation_failed` details. */
export function zodIssuesToDetails(error: z.ZodError): AppErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "",
    message: issue.message,
  }))
}

/** Parse with Zod; throw `AppError.validationFailed` on failure. */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  value: unknown
): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw AppError.validationFailed(zodIssuesToDetails(result.error))
  }
  return result.data
}

/** Parse JSON body; invalid JSON → 400 `bad_request`. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw AppError.badRequest([{ path: "body", message: "Must be valid JSON" }])
  }
}
