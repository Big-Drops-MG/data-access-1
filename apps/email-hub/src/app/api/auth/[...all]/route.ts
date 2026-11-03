import { toNextJsHandler } from "better-auth/next-js"

import { getAuth } from "@/lib/auth/server"
import { observeApiRequest } from "@/lib/with-api-request"

type AuthHandlers = ReturnType<typeof toNextJsHandler>

let handlers: AuthHandlers | undefined

function getHandlers(): AuthHandlers {
  if (!handlers) {
    handlers = toNextJsHandler(getAuth())
  }
  return handlers
}

function bindAuth(method: "GET" | "POST"): AuthHandlers["GET"] {
  return (async (...args: Parameters<AuthHandlers["GET"]>) => {
    const request = args[0]
    return observeApiRequest(request, () => getHandlers()[method](...args))
  }) as AuthHandlers["GET"]
}

export const GET = bindAuth("GET")

export const POST = bindAuth("POST")
