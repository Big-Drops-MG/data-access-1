import type { MachineScope } from "@/lib/auth/machine-hmac"
import { apiJson } from "@/lib/api-client"
import type {
  ApiClientJson,
  ApiClientWithSecretJson,
  DisabledApiClientJson,
} from "@/lib/api-clients/serialize"

export type ApiClientListItem = ApiClientJson
export type ApiClientSecretReveal = ApiClientWithSecretJson
export type DisabledApiClient = DisabledApiClientJson

export type ApiClientsListResponse = {
  api_clients: ApiClientListItem[]
}

export type CreateApiClientInput = {
  name: string
  scopes: MachineScope[]
  ip_allowlist?: string[]
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

export function fetchApiClientsList(): Promise<ApiClientsListResponse> {
  return apiJson<ApiClientsListResponse>("/api/admin/api-clients")
}

export function createApiClient(
  input: CreateApiClientInput
): Promise<ApiClientSecretReveal> {
  return apiJson<ApiClientSecretReveal>(
    "/api/admin/api-clients",
    jsonInit("POST", {
      name: input.name,
      scopes: input.scopes,
      ...(input.ip_allowlist ? { ip_allowlist: input.ip_allowlist } : {}),
    })
  )
}

export function rotateApiClientSecret(
  id: string
): Promise<ApiClientSecretReveal> {
  return apiJson<ApiClientSecretReveal>(
    `/api/admin/api-clients/${encodeURIComponent(id)}/rotate`,
    jsonInit("POST")
  )
}

export function disableApiClient(id: string): Promise<DisabledApiClient> {
  return apiJson<DisabledApiClient>(
    `/api/admin/api-clients/${encodeURIComponent(id)}/disable`,
    jsonInit("POST")
  )
}
