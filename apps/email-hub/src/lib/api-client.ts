export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export async function apiFetch(
  _input: RequestInfo | URL,
  _init?: RequestInit
): Promise<Response> {
  throw new Error("apiFetch is not implemented yet")
}
