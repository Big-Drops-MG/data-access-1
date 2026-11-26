"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { useMutationDisabledProps } from "@/components/app/online-status"
import {
  updateStaffUserRole,
  type ManagedUserListItem,
} from "@/features/users/api"
import {
  ROLE_OPTIONS,
  roleLabel,
  usersOutlineControl,
  usersPrimaryControl,
} from "@/features/users/users-ui"
import { isApiError } from "@/lib/api-client"
import type { AppRole } from "@/lib/permissions"
import { listQueryKey } from "@/lib/query-keys"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"

type ChangeRoleDialogProps = {
  user: ManagedUserListItem | null
  onOpenChange: (open: boolean) => void
}

function ChangeRoleForm({
  target,
  onClose,
}: {
  target: ManagedUserListItem
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const [role, setRole] = useState<AppRole>(target.role)

  const roleMutation = useMutation({
    mutationFn: (nextRole: AppRole) => updateStaffUserRole(target.id, nextRole),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("users"),
      })
      toast.success(
        `${updated.name || updated.email} is now ${roleLabel(updated.role)}`
      )
      onClose()
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not update user role"
      )
    },
  })

  const unchanged = role === target.role
  const canSubmit =
    !unchanged && !roleMutation.isPending && !mutationDisabled.disabled

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unchanged) return
    roleMutation.mutate(role)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="users-change-role-form"
    >
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pt-6 pb-6">
        <AlertDialogHeader className="w-full place-items-start gap-1.5 text-left">
          <AlertDialogTitle className="text-lg leading-snug font-semibold tracking-tight text-fg">
            Change role
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-pretty text-fg-muted">
            Choose a new role for {target.name || target.email}. Changes take
            effect on their next request.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-2.5 block px-0 text-sm font-medium text-fg">
            Role
          </legend>
          <div className="space-y-2.5">
            {ROLE_OPTIONS.map((option) => {
              const checked = role === option.value
              return (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3.5 py-3 hover:bg-surface-2"
                >
                  <input
                    type="radio"
                    name="change-user-role"
                    value={option.value}
                    className="mt-0.5 size-4 shrink-0 accent-fg"
                    checked={checked}
                    onChange={() => setRole(option.value)}
                    data-testid={`users-change-role-${option.value}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm leading-5 font-medium text-fg">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-5 text-fg-muted">
                      {option.description}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>

      <AlertDialogFooter className="m-0 shrink-0 gap-2 rounded-none border-t border-border bg-surface-2 px-6 py-4 group-data-[size=default]/alert-dialog-content:flex sm:justify-end">
        <button
          type="button"
          className={usersOutlineControl()}
          onClick={onClose}
          disabled={roleMutation.isPending}
          data-testid="users-change-role-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          className={usersPrimaryControl()}
          disabled={!canSubmit}
          data-testid="users-change-role-submit"
        >
          {roleMutation.isPending ? "Saving…" : "Save role"}
        </button>
      </AlertDialogFooter>
    </form>
  )
}

export function ChangeRoleDialog({
  user,
  onOpenChange,
}: ChangeRoleDialogProps) {
  return (
    <AlertDialog open={user != null} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="flex max-h-[min(44rem,calc(100dvh-2rem))] w-full max-w-[34rem] min-w-0 flex-col gap-0 overflow-hidden p-0 data-[size=default]:max-w-[34rem] sm:max-w-[34rem] data-[size=default]:sm:max-w-[34rem]"
        size="default"
      >
        {user ? (
          <ChangeRoleForm
            key={user.id}
            target={user}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
