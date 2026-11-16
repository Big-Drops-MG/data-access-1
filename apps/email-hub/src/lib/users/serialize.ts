import type { User } from "@workspace/db"

export type UserJson = {
  id: string
  email: string
  name: string
  role: User["role"]
  status: User["status"]
  two_factor_enabled: boolean
}

export type DisabledUserJson = UserJson & {
  already_disabled: boolean
}

export type InvitationJson = {
  id: string
  email: string
  role: User["role"]
  status: "invited"
  expires_at: string
  created: boolean
}

export function serializeUser(row: User): UserJson {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    two_factor_enabled: row.twoFactorEnabled,
  }
}

export function serializeInvitation(input: {
  id: string
  email: string
  role: User["role"]
  expiresAt: Date
  created: boolean
}): InvitationJson {
  return {
    id: input.id,
    email: input.email,
    role: input.role,
    status: "invited",
    expires_at: input.expiresAt.toISOString(),
    created: input.created,
  }
}
