import { createLogger, type AppLogger } from "./logger.js"
import { WEB_SERVICE } from "./types.js"

export type RequestContext = {
  requestId: string
  logger: AppLogger
}

type RequestStore = {
  getStore: () => RequestContext | undefined
  run: <T>(context: RequestContext, fn: () => T) => T
}

let storage: RequestStore | undefined

function getStorage(): RequestStore {
  if (!storage) {
    const hooks = process.getBuiltinModule("node:async_hooks") as {
      AsyncLocalStorage: new () => RequestStore
    }
    storage = new hooks.AsyncLocalStorage()
  }
  return storage
}

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
    baseLogger ??
    getStorage().getStore()?.logger ??
    processLogger ??
    rootLogger()
  const logger = parent.child({ request_id: requestId })
  return getStorage().run({ requestId, logger }, fn)
}

export function getRequestContext(): RequestContext | undefined {
  return getStorage().getStore()
}

export function getRequestId(): string | undefined {
  return getStorage().getStore()?.requestId
}

/** Active request or job logger, otherwise the process fallback logger. */
export function getContextLogger(): AppLogger {
  return getStorage().getStore()?.logger ?? rootLogger()
}
