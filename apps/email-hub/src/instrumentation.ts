export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  const { registerNode } = await import("./instrumentation.node")
  await registerNode()
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
