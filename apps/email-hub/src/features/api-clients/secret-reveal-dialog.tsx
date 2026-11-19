"use client"

import { CopyButton } from "@/components/app/copy-button"
import {
  apiClientsOutlineControl,
  apiClientsPrimaryControl,
} from "@/features/api-clients/api-clients-ui"
import type { ApiClientSecretReveal } from "@/features/api-clients/api"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"

type SecretRevealDialogProps = {
  open: boolean
  client: ApiClientSecretReveal | null
  title: string
  description: string
  onOpenChange: (open: boolean) => void
}

export function SecretRevealDialog({
  open,
  client,
  title,
  description,
  onOpenChange,
}: SecretRevealDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
      }}
    >
      <AlertDialogContent
        className="max-w-[34rem] gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
        size="default"
      >
        {open && client ? (
          <div
            className="flex flex-col"
            data-testid="api-clients-secret-reveal"
          >
            <AlertDialogHeader className="gap-2 border-b border-border px-5 py-4 text-left">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4 px-5 py-4">
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium tracking-wide text-fg-muted uppercase">
                  Key id
                </p>
                <div className="flex items-center gap-2">
                  <code
                    className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[13px] text-fg"
                    data-testid="api-clients-secret-key-id"
                  >
                    {client.id}
                  </code>
                  <CopyButton
                    value={client.id}
                    label="key id"
                    testId="api-clients-copy-key-id"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[12px] font-medium tracking-wide text-fg-muted uppercase">
                  Secret
                </p>
                <div className="flex items-center gap-2">
                  <code
                    className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-[13px] break-all text-fg"
                    data-testid="api-clients-secret-value"
                  >
                    {client.secret}
                  </code>
                  <CopyButton
                    value={client.secret}
                    label="secret"
                    testId="api-clients-copy-secret"
                  />
                </div>
              </div>

              {client.previous_secret_expires_at ? (
                <p
                  className="text-sm text-fg-muted"
                  data-testid="api-clients-previous-secret-note"
                >
                  The previous secret stays valid until{" "}
                  {new Date(client.previous_secret_expires_at).toLocaleString()}
                  .
                </p>
              ) : null}

              <p className="text-sm text-warn">
                Copy the secret now. Closing this dialog removes it from the
                screen and it cannot be shown again.
              </p>
            </div>

            <AlertDialogFooter className="border-t border-border px-5 py-4">
              <button
                type="button"
                className={apiClientsOutlineControl()}
                data-testid="api-clients-secret-dismiss"
                onClick={() => onOpenChange(false)}
              >
                I saved the secret
              </button>
              <CopyButton
                value={`${client.id}\n${client.secret}`}
                label="key id and secret"
                variant="text"
                testId="api-clients-copy-both"
                className={apiClientsPrimaryControl()}
              >
                Copy both
              </CopyButton>
            </AlertDialogFooter>
          </div>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
