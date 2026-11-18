import { toNextJsHandler } from "better-auth/next-js"
import { AppError } from "@workspace/shared"

import { readClientIp } from "@/lib/auth/machine-hmac"
import {
  consumeLoginRateLimitFromEnv,
  isLoginOrSsoAuthPath,
} from "@/lib/auth/login-rate-limit"
import { getAuth } from "@/lib/auth/server"
import { toErrorResponse } from "@/lib/api-response"
import { observeApiRequest } from "@/lib/with-api-request"

type AuthHandlers = ReturnType<typeof toNextJsHandler>

let handlers: AuthHandlers | undefined

function getHandlers(): AuthHandlers {
  if (!handlers) {
    handlers = toNextJsHandler(getAuth())
  }
  return handlers
}

async function enforceLoginRateLimit(request: Request): Promise<void> {
  if (!isLoginOrSsoAuthPath(new URL(request.url).pathname)) {
    return
  }
  const ip = readClientIp(request) ?? "unknown"
  const rate = await consumeLoginRateLimitFromEnv(ip)
  if (rate === "unavailable") {
    throw AppError.unavailable([
      { path: "rate_limit", message: "Rate limiter unavailable" },
    ])
  }
  if (rate === "limited") {
    throw AppError.rateLimited([
      { path: "rate_limit", message: "Too many login attempts" },
    ])
  }
}

function bindAuth(method: "GET" | "POST"): AuthHandlers["GET"] {
  return (async (...args: Parameters<AuthHandlers["GET"]>) => {
    const request = args[0]
    return observeApiRequest(request, async () => {
      try {
        await enforceLoginRateLimit(request)
        return getHandlers()[method](...args)
      } catch (error) {
        return toErrorResponse(error)
      }
    })
  }) as AuthHandlers["GET"]
}

export const GET = bindAuth("GET")

export const POST = bindAuth("POST")
