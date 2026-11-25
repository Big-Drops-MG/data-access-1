"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/app/form-field"
import { useMutationDisabledProps } from "@/components/app/online-status"
import { inviteStaffUser } from "@/features/users/api"
import {
  ROLE_OPTIONS,
  usersFieldControlClass,
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

type InviteUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function InviteUserForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AppRole>("operator")
  const [emailError, setEmailError] = useState<string | null>(null)

  const inviteMutation = useMutation({
    mutationFn: inviteStaffUser,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("users"),
      })
      toast.success(
        result.created
          ? `Invitation saved for ${result.email}`
          : `Invitation updated for ${result.email}`
      )
      onClose()
    },
    onError: (error) => {
      if (isApiError(error)) {
        const fieldIssue = error.details.find((d) => d.path === "email")
        if (fieldIssue) {
          setEmailError(fieldIssue.message)
          return
        }
        toast.error(error.message)
        return
      }
      toast.error("Could not invite user")
    },
  })

  const canSubmit =
    Boolean(email.trim()) &&
    !inviteMutation.isPending &&
    !mutationDisabled.disabled

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setEmailError("Enter a Google account email")
      return
    }
    setEmailError(null)
    inviteMutation.mutate({ email: trimmed, role })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="users-invite-form"
    >
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pt-6 pb-6">
        <AlertDialogHeader className="w-full place-items-start gap-1.5 text-left">
          <AlertDialogTitle className="text-lg leading-snug font-semibold tracking-tight text-fg">
            Invite user
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-pretty text-fg-muted">
            They&apos;ll set up two-step verification the first time they sign
            in.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-5">
          <FormField
            id="invite-user-email"
            label="Google account email"
            error={emailError ?? undefined}
            className="gap-1.5"
          >
            <input
              id="invite-user-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (emailError) setEmailError(null)
              }}
              aria-invalid={Boolean(emailError)}
              className={usersFieldControlClass}
              placeholder="name@bigdropsmarketing.com"
              autoComplete="off"
              data-testid="users-invite-email"
            />
          </FormField>

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
                      name="invite-user-role"
                      value={option.value}
                      className="mt-0.5 size-4 shrink-0 accent-fg"
                      checked={checked}
                      onChange={() => setRole(option.value)}
                      data-testid={`users-invite-role-${option.value}`}
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
      </div>

      <AlertDialogFooter className="m-0 shrink-0 gap-2 rounded-none border-t border-border bg-surface-2 px-6 py-4 group-data-[size=default]/alert-dialog-content:flex sm:justify-end">
        <button
          type="button"
          className={usersOutlineControl()}
          onClick={onClose}
          disabled={inviteMutation.isPending}
          data-testid="users-invite-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          className={usersPrimaryControl()}
          disabled={!canSubmit}
          data-testid="users-invite-submit"
        >
          {inviteMutation.isPending ? "Sending…" : "Send invite"}
        </button>
      </AlertDialogFooter>
    </form>
  )
}

export function InviteUserDialog({
  open,
  onOpenChange,
}: InviteUserDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="flex max-h-[min(44rem,calc(100dvh-2rem))] w-full max-w-[34rem] min-w-0 flex-col gap-0 overflow-hidden p-0 data-[size=default]:max-w-[34rem] sm:max-w-[34rem] data-[size=default]:sm:max-w-[34rem]"
        size="default"
      >
        {open ? <InviteUserForm onClose={() => onOpenChange(false)} /> : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
