import { previousSecretExpiresAt } from "@/lib/auth/machine-hmac"

export type ApiClientStatus = "active" | "revoked"

export type ApiClientJson = {
  id: string
  name: string
  key_prefix: string
  status: ApiClientStatus
  scopes: string[]
  ip_allowlist: string[]
  expires_at: string | null
  rotated_at: string | null
  previous_secret_expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ApiClientWithSecretJson = ApiClientJson & {
  secret: string
}

export type DisabledApiClientJson = ApiClientJson & {
  already_disabled: boolean
}

type ApiClientView = {
  id: string
  name: string
  keyPrefix: string
  status: ApiClientStatus
  scopes: string[] | null
  ipAllowlist: string[] | null
  expiresAt: Date | null
  rotatedAt: Date | null
  revokedAt: Date | null
  lastUsedAt: Date | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
  oldSecretHash?: string | null
}

export function serializeApiClient(row: ApiClientView): ApiClientJson {
  const previousExpires =
    row.oldSecretHash && row.rotatedAt
      ? previousSecretExpiresAt(row.rotatedAt)
      : null
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.keyPrefix,
    status: row.status,
    scopes: row.scopes ?? [],
    ip_allowlist: row.ipAllowlist ?? [],
    expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
    rotated_at: row.rotatedAt ? row.rotatedAt.toISOString() : null,
    previous_secret_expires_at: previousExpires
      ? previousExpires.toISOString()
      : null,
    revoked_at: row.revokedAt ? row.revokedAt.toISOString() : null,
    last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}
