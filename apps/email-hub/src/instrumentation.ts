export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  const { loadServerEnv } = await import("@workspace/shared")
  const { WEB_SERVICE, createLogger, setFallbackLogger } =
    await import("@workspace/logger")
  loadServerEnv("web")
  setFallbackLogger(createLogger({ service: WEB_SERVICE }))
}

type RequestErrorInfo = {
  path: string
  method: string
  headers: Record<string, string | string[] | undefined>
}

export async function onRequestError(
  error: unknown,
  request: RequestErrorInfo
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  const { logUnhandledRequestError } = await import("@/lib/request-error-log")
  logUnhandledRequestError(error, request)
}
