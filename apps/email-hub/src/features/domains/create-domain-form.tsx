"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import { z } from "zod"

import { FormField } from "@/components/app/form-field"
import { useMutationDisabledProps } from "@/components/app/online-status"
import { createDomain, type CreateDomainInput } from "@/features/domains/api"
import { fqdnSchema } from "@/lib/domains/schemas"
import { applyServerErrors, useAppForm } from "@/lib/form"
import { listQueryKey } from "@/lib/query-keys"
import {
  domainsOutlineControl,
  domainsPrimaryControl,
} from "@/features/domains/domains-ui"
import { cn } from "@workspace/ui/lib/utils"

const formCardClass =
  "space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm"

/** Empty MAIL FROM is omitted; SES uses its own default label (not bounce). */
const createDomainFormSchema = z
  .object({
    name: fqdnSchema,
    mail_from_subdomain: z
      .string()
      .trim()
      .toLowerCase()
      .max(63)
      .refine(
        (value) =>
          value.length === 0 ||
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
        "Use a single label of letters, numbers, or hyphens"
      ),
  })
  .strict()

type CreateDomainFormValues = z.output<typeof createDomainFormSchema>

type CreateDomainFormProps = {
  onSuccess?: (domainId: string) => void
  className?: string
}

/**
 * Domain create form using the shared form kit (T-061 / SD#12.6).
 * Fields match POST /api/domains.
 */
export function CreateDomainForm({
  onSuccess,
  className,
}: CreateDomainFormProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const defaults: CreateDomainFormValues = {
    name: "",
    mail_from_subdomain: "",
  }
  const form = useAppForm(createDomainFormSchema, {
    defaultValues: defaults,
  })

  const create = useMutation({
    mutationFn: (input: CreateDomainInput) => createDomain(input),
    meta: {
      skipConflictDialog: true,
      conflictInvalidateKeys: [listQueryKey("domains")],
    },
    onSuccess: async (domain) => {
      form.reset(defaults)
      await queryClient.invalidateQueries({ queryKey: listQueryKey("domains") })
      toast.success("Domain created")
      onSuccess?.(domain.id)
    },
  })

  const submitDisabled =
    create.isPending || form.formState.isSubmitting || mutationDisabled.disabled

  const watchedName = form.watch("name").trim().toLowerCase()
  const watchedSubdomain = form
    .watch("mail_from_subdomain")
    .trim()
    .toLowerCase()
  const mailFromHint = watchedSubdomain
    ? `Sets ${watchedSubdomain}.${watchedName || "{domain}"} for bounce handling.`
    : `Optional. Leave blank for the default, or enter a label like mail.`

  return (
    <form
      className={cn(formCardClass, className)}
      data-testid="domains-create-form"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (mutationDisabled.disabled) {
          return
        }
        create.mutate(
          {
            name: values.name,
            ...(values.mail_from_subdomain
              ? { mail_from_subdomain: values.mail_from_subdomain }
              : {}),
          },
          {
            onError: (error) => {
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
                    : "Could not create domain")
                toast.error(message)
              }
            },
          }
        )
      })}
    >
      <FormField
        id="domains-create-name"
        name="name"
        label="Domain (FQDN)"
        required
        description="Sending identity for From addresses (e.g. no-reply@e.quotifii.com). Prefer a subdomain you only send from."
        error={form.formState.errors.name?.message}
        testIdPrefix="domains"
      >
        <input
          id="domains-create-name"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.quotifii.com"
          aria-invalid={Boolean(form.formState.errors.name)}
          data-testid="domains-create-name"
          disabled={create.isPending || mutationDisabled.disabled}
          {...form.register("name")}
        />
      </FormField>

      <FormField
        id="domains-create-mail-from"
        name="mail_from_subdomain"
        label="MAIL FROM subdomain"
        description={mailFromHint}
        error={form.formState.errors.mail_from_subdomain?.message}
        testIdPrefix="domains"
      >
        <input
          id="domains-create-mail-from"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={Boolean(form.formState.errors.mail_from_subdomain)}
          data-testid="domains-create-mail-from"
          disabled={create.isPending || mutationDisabled.disabled}
          {...form.register("mail_from_subdomain")}
        />
      </FormField>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
        <Link
          href="/domains"
          className={domainsOutlineControl()}
          data-testid="domains-create-cancel"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={submitDisabled}
          title={mutationDisabled.title}
          data-testid="domains-create-submit"
          className={domainsPrimaryControl()}
        >
          {create.isPending ? "Creating…" : "Create in SES"}
        </button>
      </div>
    </form>
  )
}
