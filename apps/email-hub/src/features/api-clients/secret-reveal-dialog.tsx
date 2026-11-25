"use client"

import { KeyRound } from "lucide-react"
import { useState } from "react"

import { CopyButton } from "@/components/app/copy-button"
import { apiClientsOutlineControl } from "@/features/api-clients/api-clients-ui"
import type { ApiClientSecretReveal } from "@/features/api-clients/api"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"

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
  const credentialKey = client ? `${client.id}:${client.secret}` : ""
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null)
  const acknowledged = credentialKey !== "" && acknowledgedKey === credentialKey

  function dismiss() {
    if (!acknowledged) {
      return
    }
    setAcknowledgedKey(null)
    onOpenChange(false)
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          dismiss()
          return
        }
        onOpenChange(next)
      }}
    >
      <AlertDialogContent
        className="w-full max-w-[28rem] gap-0 overflow-hidden p-0 shadow-[0_16px_40px_rgb(15_31_58/0.16)] data-[size=default]:max-w-[28rem] sm:max-w-[28rem] data-[size=default]:sm:max-w-[28rem]"
        size="default"
      >
        {open && client ? (
          <div
            className="px-6 pt-6 pb-5"
            data-testid="api-clients-secret-reveal"
          >
            <header className="space-y-1.5">
              <AlertDialogTitle className="flex items-center gap-2 text-[15px] leading-5 font-semibold tracking-tight text-fg">
                <KeyRound
                  className="size-4 shrink-0 text-[#f97316]"
                  strokeWidth={2.25}
                  aria-hidden
                />
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] leading-5 text-pretty text-fg-muted">
                {description}
              </AlertDialogDescription>
            </header>

            <section className="mt-5 space-y-4" aria-label="New credentials">
              <div>
                <p
                  id="api-client-secret-key-label"
                  className="text-[13px] leading-5 font-medium text-fg"
                >
                  Key ID
                </p>
                <div className="mt-0.5 flex items-center justify-between gap-3">
                  <code
                    className="min-w-0 font-mono text-[13px] leading-5 break-all text-fg"
                    data-testid="api-clients-secret-key-id"
                    aria-labelledby="api-client-secret-key-label"
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

              <div>
                <p
                  id="api-client-secret-value-label"
                  className="text-[13px] leading-5 font-medium text-fg"
                >
                  Secret
                </p>
                <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2.5">
                  <code
                    className="min-w-0 flex-1 font-mono text-[13px] leading-5 break-all text-fg"
                    data-testid="api-clients-secret-value"
                    aria-labelledby="api-client-secret-value-label"
                  >
                    {client.secret}
                  </code>
                  <CopyButton
                    value={client.secret}
                    label="secret"
                    testId="api-clients-copy-secret"
                  />
                </div>
                <p className="mt-2 text-[12px] leading-5 text-fg-muted">
                  Store it in the landing page&apos;s secret manager, not in
                  code.
                </p>
              </div>

              {client.previous_secret_expires_at ? (
                <p
                  className="text-[12px] leading-5 text-fg-muted"
                  data-testid="api-clients-previous-secret-note"
                >
                  The previous secret stays valid until{" "}
                  {new Date(client.previous_secret_expires_at).toLocaleString()}
                  .
                </p>
              ) : null}
            </section>

            <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-sm leading-5 text-fg">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-fg"
                checked={acknowledged}
                onChange={(event) =>
                  setAcknowledgedKey(
                    event.target.checked ? credentialKey : null
                  )
                }
                data-testid="api-clients-secret-acknowledged"
              />
              I copied the secret
            </label>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className={cn(
                  apiClientsOutlineControl(),
                  "disabled:text-fg-muted disabled:opacity-100 disabled:hover:bg-surface"
                )}
                disabled={!acknowledged}
                data-testid="api-clients-secret-dismiss"
                onClick={dismiss}
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
