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
import { assertStaffRequestOrigin } from "@/lib/security/origin-check"

const MACHINE_HEADER_NAMES = ["x-key-id", "x-signature", "x-timestamp"] as const

/** True when the request presents machine-auth headers (SD#14.4). */
export function isMachineAuthAttempt(request: Request): boolean {
  return MACHINE_HEADER_NAMES.some((name) => request.headers.has(name))
}

export function assertStaffApiCaller(request: Request): void {
  if (isMachineAuthAttempt(request)) {
    throw AppError.unauthorized([
      {
        path: "authorization",
        message: "Machine keys cannot call staff APIs",
      },
    ])
  }
  assertStaffRequestOrigin(request)
}

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
  deps?: Partial<AuthenticateMachineDeps>
  skipTouch?: boolean
}

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
      void 0
    }
  }

  return { client, rawBody }
}
