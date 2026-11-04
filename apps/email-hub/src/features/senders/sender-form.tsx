"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import { z } from "zod"

import { FormField } from "@/components/app/form-field"
import { useMutationDisabledProps } from "@/components/app/online-status"
import {
  createSender,
  fetchActiveDomainsForSender,
  updateSender,
  type SenderListItem,
} from "@/features/senders/api"
import {
  sendersFieldControlClass,
  sendersOutlineControl,
  sendersPrimaryControl,
} from "@/features/senders/senders-ui"
import { applyServerErrors, useAppForm } from "@/lib/form"
import { listQueryKey, detailQueryKey } from "@/lib/query-keys"
import { localPartSchema } from "@/lib/senders/schemas"
import { emailSchema } from "@workspace/shared"
import { cn } from "@workspace/ui/lib/utils"

const formCardClass =
  "space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm"

const senderFormSchema = z
  .object({
    from_name: z.string().trim().min(1, "From name is required").max(200),
    local_part: localPartSchema,
    domain_id: z.string().uuid("Select a domain"),
    reply_to: z
      .string()
      .trim()
      .refine(
        (value) => value.length === 0 || emailSchema.safeParse(value).success,
        "Enter a full email address, like support@dataaccess1.com."
      ),
  })
  .strict()

type SenderFormValues = z.output<typeof senderFormSchema>

type SenderFormProps = {
  mode: "create" | "edit"
  initial?: SenderListItem
  domainName?: string
  onSuccess?: (sender: SenderListItem) => void
  className?: string
}

function localPartFromEmail(fromEmail: string): string {
  const at = fromEmail.indexOf("@")
  return at === -1 ? fromEmail : fromEmail.slice(0, at)
}

export function SenderForm({
  mode,
  initial,
  domainName,
  onSuccess,
  className,
}: SenderFormProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()

  const domainsQuery = useQuery({
    queryKey: listQueryKey("senders-domains", { status: "verified" }),
    queryFn: () => fetchActiveDomainsForSender(),
    enabled: mode === "create",
  })

  const verifiedDomains = domainsQuery.data?.data ?? []
  const lockedDomainName =
    domainName ??
    (initial
      ? initial.from_email.slice(initial.from_email.indexOf("@") + 1)
      : "")

  const defaults: SenderFormValues = {
    from_name: initial?.from_name ?? "",
    local_part: initial ? localPartFromEmail(initial.from_email) : "",
    domain_id: initial?.domain_id ?? "",
    reply_to: initial?.reply_to ?? "",
  }

  const form = useAppForm(senderFormSchema, {
    defaultValues: defaults,
  })

  const watchedName = form.watch("from_name").trim()
  const watchedLocal = form.watch("local_part").trim().toLowerCase()
  const watchedDomainId = form.watch("domain_id")
  const selectedDomainName =
    mode === "edit"
      ? lockedDomainName
      : (verifiedDomains.find((domain) => domain.id === watchedDomainId)
          ?.name ?? "")
  const previewAddress =
    watchedLocal && selectedDomainName
      ? `${watchedLocal}@${selectedDomainName}`
      : ""

  const create = useMutation({
    mutationFn: createSender,
    meta: {
      skipConflictDialog: true,
      conflictInvalidateKeys: [listQueryKey("senders")],
    },
    onSuccess: async (sender) => {
      form.reset(defaults)
      await queryClient.invalidateQueries({ queryKey: listQueryKey("senders") })
      toast.success("Sender created")
      onSuccess?.(sender)
    },
  })

  const update = useMutation({
    mutationFn: (values: SenderFormValues) => {
      if (!initial) {
        throw new Error("Missing sender")
      }
      return updateSender(initial.id, {
        version: initial.version,
        from_name: values.from_name,
        local_part: values.local_part,
        reply_to: values.reply_to.trim() ? values.reply_to.trim() : null,
      })
    },
    meta: {
      skipConflictDialog: true,
      conflictInvalidateKeys: [
        listQueryKey("senders"),
        initial
          ? detailQueryKey("senders", initial.id)
          : listQueryKey("senders"),
      ],
    },
    onSuccess: async (sender) => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey("senders") })
      await queryClient.invalidateQueries({
        queryKey: detailQueryKey("senders", sender.id),
      })
      toast.success("Sender updated")
      onSuccess?.(sender)
    },
  })

  const pending = create.isPending || update.isPending
  const submitDisabled =
    pending || form.formState.isSubmitting || mutationDisabled.disabled

  return (
    <div
      className={cn(
        "grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(16rem,3fr)]",
        className
      )}
    >
      <form
        className={formCardClass}
        data-testid="senders-form"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          if (mutationDisabled.disabled) {
            return
          }
          const payload = {
            domain_id: values.domain_id,
            from_name: values.from_name,
            local_part: values.local_part,
            reply_to: values.reply_to.trim() ? values.reply_to.trim() : null,
          }
          const onError = (error: unknown) => {
            const { fieldMapped, unmapped } = applyServerErrors(
              error,
              form.setError,
              form.getValues()
            )
            if (!fieldMapped || unmapped.length > 0) {
              const message =
                unmapped[0]?.message ??
                (error instanceof Error
                  ? error.message
                  : "Could not save sender")
              toast.error(message)
            }
          }
          if (mode === "create") {
            create.mutate(payload, { onError })
            return
          }
          update.mutate(values, { onError })
        })}
      >
        <FormField
          id="senders-from-name"
          name="from_name"
          label="From name"
          required
          description="Display name recipients see in their inbox."
          error={form.formState.errors.from_name?.message}
          testIdPrefix="senders"
        >
          <input
            id="senders-from-name"
            type="text"
            autoComplete="off"
            aria-invalid={Boolean(form.formState.errors.from_name)}
            data-testid="senders-from-name"
            disabled={pending || mutationDisabled.disabled}
            className={sendersFieldControlClass}
            {...form.register("from_name")}
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="senders-local-part"
            name="local_part"
            label="Local part"
            required
            error={form.formState.errors.local_part?.message}
            testIdPrefix="senders"
          >
            <input
              id="senders-local-part"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={Boolean(form.formState.errors.local_part)}
              data-testid="senders-local-part"
              disabled={pending || mutationDisabled.disabled}
              className={sendersFieldControlClass}
              {...form.register("local_part")}
            />
          </FormField>

          <FormField
            id="senders-domain-id"
            name="domain_id"
            label="Domain"
            required
            description={
              mode === "create"
                ? "Active domains only."
                : "Domain is fixed after create."
            }
            error={form.formState.errors.domain_id?.message}
            testIdPrefix="senders"
          >
            {mode === "edit" ? (
              <input
                id="senders-domain-id"
                type="text"
                value={lockedDomainName}
                disabled
                readOnly
                className={sendersFieldControlClass}
                data-testid="senders-domain-locked"
              />
            ) : (
              <select
                id="senders-domain-id"
                aria-invalid={Boolean(form.formState.errors.domain_id)}
                data-testid="senders-domain-id"
                disabled={
                  pending || mutationDisabled.disabled || domainsQuery.isPending
                }
                className={sendersFieldControlClass}
                {...form.register("domain_id")}
              >
                <option value="">Select domain</option>
                {verifiedDomains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>

        {mode === "create" && domainsQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Could not load active domains.
          </p>
        ) : null}

        <FormField
          id="senders-reply-to"
          name="reply_to"
          label="Reply-to"
          description="Optional. Must be a full email address when set."
          error={form.formState.errors.reply_to?.message}
          testIdPrefix="senders"
        >
          <input
            id="senders-reply-to"
            type="email"
            autoComplete="off"
            aria-invalid={Boolean(form.formState.errors.reply_to)}
            data-testid="senders-reply-to"
            disabled={pending || mutationDisabled.disabled}
            className={sendersFieldControlClass}
            {...form.register("reply_to")}
          />
        </FormField>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
          <Link
            href="/senders"
            className={sendersOutlineControl()}
            data-testid="senders-form-cancel"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitDisabled}
            title={mutationDisabled.title}
            data-testid="senders-form-submit"
            className={sendersPrimaryControl()}
          >
            {pending
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
                ? "Create sender"
                : "Save changes"}
          </button>
        </div>
      </form>

      <aside
        className="space-y-3 rounded-xl border border-border bg-surface p-6 shadow-sm"
        aria-labelledby="senders-preview-heading"
        data-testid="senders-preview"
      >
        <h2
          id="senders-preview-heading"
          className="text-body font-semibold text-fg"
        >
          Preview
        </h2>
        <p className="text-caption text-fg-muted">Inbox shows</p>
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
          <p className="truncate text-sm font-semibold text-fg">
            {watchedName || "From name"}
          </p>
          <p className="truncate font-mono text-[13px] text-fg-muted">
            {previewAddress || "local@domain"}
          </p>
        </div>
      </aside>
    </div>
  )
}
