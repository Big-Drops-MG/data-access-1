import { AppError } from "@workspace/shared"

import { getSession } from "@/lib/auth"
import {
  authenticateMachineRequest,
  type AuthenticateMachineDeps,
  type MachineClientAuthRecord,
} from "@/lib/auth/machine-hmac"
import {
  resolveMachineClientFromDb,
  touchMachineClientLastUsed,
} from "@/lib/auth/machine-client-lookup"
import { consumeMachineRateLimitFromEnv } from "@/lib/auth/machine-rate-limit"

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
 * Prefer {@link requireMachineAuth} for HMAC-protected routes.
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

export type RequireMachineAuthOptions = {
  scope: string
  /** Injected for unit tests (Done When). */
  deps?: Partial<AuthenticateMachineDeps>
  /** Skip last_used_at update (tests). */
  skipTouch?: boolean
}

/**
 * Full HMAC machine auth for `/api/ext/**` (SD#10.2 / SD#14.4).
 * Do not use on `/api/ext/webhooks/ses` (SNS signature instead).
 */
export async function requireMachineAuth(
  request: Request,
  options: RequireMachineAuthOptions
): Promise<{ client: MachineClientAuthRecord; rawBody: Buffer }> {
  await requireMachineCaller(request)

  const rawBody = Buffer.from(await request.arrayBuffer())
  const client = await authenticateMachineRequest(request, rawBody, {
    requiredScope: options.scope,
    resolveClient: options.deps?.resolveClient ?? resolveMachineClientFromDb,
    consumeRateLimit:
      options.deps?.consumeRateLimit ?? consumeMachineRateLimitFromEnv,
    now: options.deps?.now,
    clientIp: options.deps?.clientIp,
  })

  if (!options.skipTouch) {
    try {
      await touchMachineClientLastUsed(client.id)
    } catch {
      // Auth already succeeded; last_used_at is best-effort.
    }
  }

  return { client, rawBody }
}
