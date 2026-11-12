import { AppError } from "@workspace/shared"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUserIdParam(userId: string): string {
  if (!UUID_RE.test(userId)) {
    throw AppError.badRequest([{ path: "userId", message: "Must be a uuid" }])
  }
  return userId.toLowerCase()
}
