"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/app/form-field"
import { useMutationDisabledProps } from "@/components/app/online-status"
import {
  createApiClient,
  type ApiClientSecretReveal,
} from "@/features/api-clients/api"
import {
  apiClientsFieldControlClass,
  apiClientsOutlineControl,
  apiClientsPrimaryControl,
} from "@/features/api-clients/api-clients-ui"
import { MACHINE_SCOPES, type MachineScope } from "@/lib/auth/machine-scopes"
import { isApiError } from "@/lib/api-client"
import { listQueryKey } from "@/lib/query-keys"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"

const SCOPE_HELP: Record<MachineScope, string> = {
  "emails:send": "POST /api/ext/emails/send",
  "emails:read": "GET /api/ext/emails/{message_id}",
  "arohaa:webhook": "POST /api/ext/webhooks/arohaa",
}

type CreateApiClientDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (client: ApiClientSecretReveal) => void
}

type CreateFormProps = {
  onClose: () => void
  onCreated: (client: ApiClientSecretReveal) => void
}

function CreateApiClientForm({ onClose, onCreated }: CreateFormProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<MachineScope[]>(["arohaa:webhook"])
  const [allowlistText, setAllowlistText] = useState("")

  const allowlist = useMemo(
    () =>
      allowlistText
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    [allowlistText]
  )

  const createMutation = useMutation({
    mutationFn: createApiClient,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("api-clients"),
      })
      toast.success("API client created")
      onCreated(created)
      onClose()
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not create API client"
      )
    },
  })

  const canSubmit =
    Boolean(name.trim()) &&
    scopes.length > 0 &&
    !createMutation.isPending &&
    !mutationDisabled.disabled

  function toggleScope(scope: MachineScope) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope]
    )
  }

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed || scopes.length === 0) {
      return
    }
    createMutation.mutate({
      name: trimmed,
      scopes,
      ...(allowlist.length > 0 ? { ip_allowlist: allowlist } : {}),
    })
  }

  return (
    <div className="flex flex-col" data-testid="api-clients-create-form">
      <AlertDialogHeader className="gap-2 border-b border-border px-5 py-4 text-left">
        <AlertDialogTitle>New API client</AlertDialogTitle>
        <AlertDialogDescription>
          Create a machine key for integrations. The secret is shown once after
          create.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="space-y-4 px-5 py-4">
        <FormField id="api-client-name" label="Name">
          <input
            id="api-client-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={apiClientsFieldControlClass}
            placeholder="Arohaa webhook"
            autoComplete="off"
            data-testid="api-clients-create-name"
          />
        </FormField>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">Scopes</legend>
          <div className="space-y-2">
            {MACHINE_SCOPES.map((scope) => {
              const checked = scopes.includes(scope)
              return (
                <label
                  key={scope}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-fg"
                    checked={checked}
                    onChange={() => toggleScope(scope)}
                    data-testid={`api-clients-scope-${scope}`}
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-[13px] text-fg">
                      {scope}
                    </span>
                    <span className="block text-[12px] text-fg-muted">
                      {SCOPE_HELP[scope]}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <FormField
          id="api-client-allowlist"
          label="IP allowlist (optional)"
          description="One IP or CIDR per line. Leave empty to allow any IP."
        >
          <textarea
            id="api-client-allowlist"
            value={allowlistText}
            onChange={(event) => setAllowlistText(event.target.value)}
            className={`${apiClientsFieldControlClass} min-h-24 resize-y py-2.5`}
            placeholder="203.0.113.10&#10;198.51.100.0/24"
            data-testid="api-clients-create-allowlist"
          />
        </FormField>
      </div>

      <AlertDialogFooter className="border-t border-border px-5 py-4">
        <button
          type="button"
          className={apiClientsOutlineControl()}
          onClick={onClose}
          disabled={createMutation.isPending}
          data-testid="api-clients-create-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className={apiClientsPrimaryControl()}
          disabled={!canSubmit}
          onClick={handleSubmit}
          data-testid="api-clients-create-submit"
        >
          {createMutation.isPending ? "Creating…" : "Create client"}
        </button>
      </AlertDialogFooter>
    </div>
  )
}

export function CreateApiClientDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateApiClientDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-[34rem] gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
        size="default"
      >
        {open ? (
          <CreateApiClientForm
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
