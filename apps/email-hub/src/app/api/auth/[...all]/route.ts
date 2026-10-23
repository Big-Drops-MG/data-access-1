import { toNextJsHandler } from "better-auth/next-js"

import { getAuth } from "@/lib/auth/server"

type AuthHandlers = ReturnType<typeof toNextJsHandler>

let handlers: AuthHandlers | undefined

function getHandlers(): AuthHandlers {
  if (!handlers) {
    handlers = toNextJsHandler(getAuth())
  }
  return handlers
}

export const GET = ((...args: Parameters<AuthHandlers["GET"]>) =>
  getHandlers().GET(...args)) as AuthHandlers["GET"]

export const POST = ((...args: Parameters<AuthHandlers["POST"]>) =>
  getHandlers().POST(...args)) as AuthHandlers["POST"]
