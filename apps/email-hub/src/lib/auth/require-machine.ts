import { AppError } from "@workspace/shared"

import { getSession } from "@/lib/auth"

const MACHINE_HEADER_NAMES = ["x-key-id", "x-signature", "x-timestamp"] as const

/** True when the request presents machine-auth headers (SD#14.4). */
export function isMachineAuthAttempt(request: Request): boolean {
  return MACHINE_HEADER_NAMES.some((name) => request.headers.has(name))
}

/**
 * Staff APIs reject machine keys (SD#14.3).
 * Call at the start of every session-protected staff route.
 */
export function assertStaffApiCaller(request: Request): void {
  if (isMachineAuthAttempt(request)) {
    throw AppError.unauthorized([
      {
        path: "authorization",
        message: "Machine keys cannot call staff APIs",
      },
    ])
  }
}

/**
 * `/api/ext/**` rejects pure session callers (SD#14.3).
 * Full HMAC verification is a separate machine-auth task; this enforces the
 * session-vs-machine boundary and requires machine headers to be present.
 */
export async function requireMachineCaller(request: Request): Promise<void> {
  if (!isMachineAuthAttempt(request)) {
    const session = await getSession()
    if (session) {
      throw AppError.forbidden([
        {
          path: "authorization",
          message: "Sessions cannot call /api/ext",
        },
      ])
    }
    throw AppError.unauthorized([
      {
        path: "authorization",
        message: "Machine authentication required",
      },
    ])
  }
}
