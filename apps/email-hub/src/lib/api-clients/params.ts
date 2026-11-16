import { AppError } from "@workspace/shared"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseApiClientId(id: string): string {
  if (!UUID_RE.test(id)) {
    throw AppError.badRequest([{ path: "id", message: "Must be a uuid" }])
  }
  return id.toLowerCase()
}
