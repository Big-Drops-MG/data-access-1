import { apiJson } from "@/lib/api-client"
import type { AppRole } from "@/lib/permissions"

export type ManagedUserStatus = "active" | "invited" | "deactivated"

export type ManagedUserListItem = {
  id: string
  email: string
  name: string | null
  role: AppRole
  status: ManagedUserStatus
  two_factor_enabled: boolean
  two_factor_locked: boolean
  last_sign_in_at: string | null
  expires_at: string | null
}

export type UsersListResponse = {
  users: ManagedUserListItem[]
}

export type InviteUserInput = {
  email: string
  role: AppRole
}

export type InvitationResponse = {
  id: string
  email: string
  role: AppRole
  status: "invited"
  expires_at: string
  created: boolean
}

export type UpdatedUserResponse = {
  id: string
  email: string
  name: string
  role: AppRole
  status: "active" | "deactivated"
  two_factor_enabled: boolean
}

export type DisabledUserResponse = UpdatedUserResponse & {
  already_disabled: boolean
}

export function fetchUsersList(): Promise<UsersListResponse> {
  return apiJson<UsersListResponse>("/api/admin/users")
}

export function inviteStaffUser(
  input: InviteUserInput
): Promise<InvitationResponse> {
  return apiJson<InvitationResponse>("/api/admin/users/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function updateStaffUserRole(
  userId: string,
  role: AppRole
): Promise<UpdatedUserResponse> {
  return apiJson<UpdatedUserResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }
  )
}

export function disableStaffUser(
  userId: string
): Promise<DisabledUserResponse> {
  return apiJson<DisabledUserResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}/disable`,
    {
      method: "POST",
    }
  )
}

export function resetStaffUserTwoFactor(userId: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(
    `/api/admin/users/${encodeURIComponent(userId)}/two-factor/reset`,
    {
      method: "POST",
    }
  )
}

export function deleteStaffUser(
  userId: string
): Promise<{ id: string; deleted: true }> {
  return apiJson<{ id: string; deleted: true }>(
    `/api/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
    }
  )
}

export function revokeStaffInvitation(
  invitationId: string
): Promise<{ id: string; deleted: true }> {
  return apiJson<{ id: string; deleted: true }>(
    `/api/admin/users/invitations/${encodeURIComponent(invitationId)}`,
    {
      method: "DELETE",
    }
  )
}
