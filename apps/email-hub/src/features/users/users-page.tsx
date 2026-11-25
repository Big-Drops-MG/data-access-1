"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import {
  deleteStaffUser,
  disableStaffUser,
  inviteStaffUser,
  resetStaffUserTwoFactor,
  revokeStaffInvitation,
  type ManagedUserListItem,
} from "@/features/users/api"
import { ChangeRoleDialog } from "@/features/users/change-role-dialog"
import { InviteUserDialog } from "@/features/users/invite-user-dialog"
import { useUsersList } from "@/features/users/use-users-list"
import { usersColumns, type UserRow } from "@/features/users/users-columns"
import { usersPrimaryControl } from "@/features/users/users-ui"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { listQueryKey } from "@/lib/query-keys"

type UsersPageProps = {
  currentUserId: string
}

export function UsersPage({ currentUserId }: UsersPageProps) {
  const queryClient = useQueryClient()
  const tableState = useDataTableUrlState({ filterKeys: [] })
  const list = useUsersList()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [roleTarget, setRoleTarget] = useState<ManagedUserListItem | null>(null)

  const rows = useMemo(
    (): UserRow[] => list.data?.users ?? [],
    [list.data?.users]
  )

  const disableMutation = useMutation({
    mutationFn: (row: UserRow) => disableStaffUser(row.id),
    onSuccess: async (disabled) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("users"),
      })
      toast.success(
        disabled.already_disabled
          ? `${disabled.name || disabled.email} was already disabled`
          : `${disabled.name || disabled.email} disabled`
      )
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.message : "Could not disable user")
    },
  })

  const resetTwoFactorMutation = useMutation({
    mutationFn: (row: UserRow) => resetStaffUserTwoFactor(row.id),
    onSuccess: async (_result, row) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("users"),
      })
      toast.success(`Two-step verification reset for ${row.name || row.email}`)
    },
    onError: (error) => {
      toast.error(
        isApiError(error)
          ? error.message
          : "Could not reset two-step verification"
      )
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: (row: UserRow) => deleteStaffUser(row.id),
    onSuccess: async (_result, row) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("users"),
      })
      toast.success(`${row.name || row.email} deleted`)
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.message : "Could not delete user")
    },
  })

  const resendInviteMutation = useMutation({
    mutationFn: (row: UserRow) =>
      inviteStaffUser({ email: row.email, role: row.role }),
    onSuccess: async (_result, row) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("users"),
      })
      toast.success(`Invitation resent to ${row.email}`)
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not resend invitation"
      )
    },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (row: UserRow) => revokeStaffInvitation(row.id),
    onSuccess: async (_result, row) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("users"),
      })
      toast.success(`Invitation removed for ${row.email}`)
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not remove invitation"
      )
    },
  })

  function rowActions(row: UserRow) {
    if (row.status === "invited") {
      return [
        {
          id: "resend-invite",
          label: "Resend invitation",
          onSelect: (selected: UserRow) => {
            resendInviteMutation.mutate(selected)
          },
        },
        {
          id: "revoke-invite",
          label: "Remove invitation",
          destructive: true,
          confirm: {
            title: "Remove this invitation?",
            description: `${row.email} will no longer be able to sign in until invited again.`,
            confirmLabel: "Remove invitation",
          },
          onSelect: (selected: UserRow) => {
            revokeInviteMutation.mutate(selected)
          },
        },
      ]
    }

    if (row.status === "deactivated") {
      const displayName = row.name || row.email
      return [
        {
          id: "delete",
          label: "Delete user",
          destructive: true,
          confirm: {
            title: "Delete this user?",
            description: `${displayName} will be permanently removed from Email Hub.`,
            confirmLabel: "Delete user",
          },
          onSelect: (selected: UserRow) => {
            deleteUserMutation.mutate(selected)
          },
        },
      ]
    }

    if (row.id === currentUserId) {
      return [
        {
          id: "self",
          label: "Your account",
          onSelect: () => {
            toast.message(
              "You cannot change your own role, disable, or delete yourself"
            )
          },
        },
      ]
    }

    const displayName = row.name || row.email
    return [
      {
        id: "change-role",
        label: "Change role",
        onSelect: (selected: UserRow) => {
          setRoleTarget(selected)
        },
      },
      {
        id: "reset-2fa",
        label: "Reset 2FA",
        confirm: {
          title: "Reset two-step verification?",
          description: `${displayName} will be signed out and must set up two-step verification again on next sign-in.`,
          confirmLabel: "Reset 2FA",
        },
        onSelect: (selected: UserRow) => {
          resetTwoFactorMutation.mutate(selected)
        },
      },
      {
        id: "disable",
        label: "Disable",
        destructive: true,
        confirm: {
          title: "Disable this user?",
          description: `${displayName} will be signed out immediately and will no longer be able to access Email Hub.`,
          confirmLabel: "Disable",
        },
        onSelect: (selected: UserRow) => {
          disableMutation.mutate(selected)
        },
      },
      {
        id: "delete",
        label: "Delete user",
        destructive: true,
        confirm: {
          title: "Delete this user?",
          description: `${displayName} will be signed out and permanently removed from Email Hub.`,
          confirmLabel: "Delete user",
        },
        onSelect: (selected: UserRow) => {
          deleteUserMutation.mutate(selected)
        },
      },
    ]
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Only invited people can sign in with Google. Changes take effect on their next request."
        actions={
          <button
            type="button"
            className={usersPrimaryControl()}
            data-testid="users-invite-open"
            onClick={() => setInviteOpen(true)}
          >
            <Plus className="size-3.5" strokeWidth={2} aria-hidden />
            Invite user
          </button>
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load users."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="users"
        columns={usersColumns}
        data={rows}
        getRowId={(row) => row.id}
        nextCursor={null}
        pageSize={tableState.limit}
        onPageSizeChange={tableState.setLimit}
        onNextPage={tableState.goNext}
        onPreviousPage={tableState.goPrevious}
        canPreviousPage={false}
        isLoading={list.isPending && !list.data}
        showColumnToggle={false}
        equalColumnWidths
        animateRows
        rowActions={rowActions}
        testIdPrefix="users"
        emptyState={
          <p
            className="px-4 py-10 text-center text-body text-fg-muted"
            data-testid="users-empty"
          >
            No users yet. Invite a teammate to grant access.
          </p>
        }
      />

      <p className="text-[13px] text-fg-muted">
        You can&apos;t change your own role. The last active Admin can&apos;t be
        disabled or demoted.
      </p>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <ChangeRoleDialog
        user={roleTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRoleTarget(null)
          }
        }}
      />
    </div>
  )
}
