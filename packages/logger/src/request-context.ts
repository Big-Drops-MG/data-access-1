import { AsyncLocalStorage } from "node:async_hooks"

import { createLogger, type AppLogger } from "./logger.js"
import { WEB_SERVICE } from "./types.js"

export type RequestContext = {
  requestId: string
  logger: AppLogger
}

const storage = new AsyncLocalStorage<RequestContext>()

let processLogger: AppLogger | undefined

function rootLogger(): AppLogger {
  if (!processLogger) {
    processLogger = createLogger({ service: WEB_SERVICE })
  }
  return processLogger
}

/** Process-wide logger used when no request or job context is active. */
export function setFallbackLogger(logger: AppLogger): void {
  processLogger = logger
}

export function runWithRequestContext<T>(
  requestId: string,
  fn: () => T,
  baseLogger?: AppLogger
): T {
  const parent =
    baseLogger ?? storage.getStore()?.logger ?? processLogger ?? rootLogger()
  const logger = parent.child({ request_id: requestId })
  return storage.run({ requestId, logger }, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId
}

/** Active request or job logger, otherwise the process fallback logger. */
export function getContextLogger(): AppLogger {
  return storage.getStore()?.logger ?? rootLogger()
}
