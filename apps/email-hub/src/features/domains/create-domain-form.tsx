"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"
import { type z } from "zod"

import { FormField } from "@/components/app/form-field"
import { useMutationDisabledProps } from "@/components/app/online-status"
import { createDomain, type CreateDomainInput } from "@/features/domains/api"
import {
  createDomainBodySchema,
  mailFromSubdomainSchema,
} from "@/lib/domains/schemas"
import { applyServerErrors, useAppForm } from "@/lib/form"
import { listQueryKey } from "@/lib/query-keys"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export const DEFAULT_MAIL_FROM_SUBDOMAIN = "bounce"

const createDomainFormSchema = createDomainBodySchema.extend({
  mail_from_subdomain: mailFromSubdomainSchema,
})

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
    mail_from_subdomain: DEFAULT_MAIL_FROM_SUBDOMAIN,
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
  const mailFromHint = `Becomes ${watchedSubdomain || "{mail_from}"}.${watchedName || "{domain}"}. Needed for SPF alignment.`

  return (
    <form
      className={cn(
        "space-y-5 rounded-md border border-border bg-surface p-6",
        className
      )}
      data-testid="domains-create-form"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (mutationDisabled.disabled) {
          return
        }
        create.mutate(
          {
            name: values.name,
            mail_from_subdomain: values.mail_from_subdomain,
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
        description="Use a subdomain you only send from, not the root domain."
        error={form.formState.errors.name?.message}
        testIdPrefix="domains"
      >
        <input
          id="domains-create-name"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="mail.example.com"
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
        required
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

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-5">
        <Link
          href="/domains"
          className={buttonVariants({ variant: "outline", size: "lg" })}
          data-testid="domains-create-cancel"
        >
          Cancel
        </Link>
        <Button
          type="submit"
          size="lg"
          disabled={submitDisabled}
          title={mutationDisabled.title}
          data-testid="domains-create-submit"
        >
          {create.isPending ? "Creating…" : "Create in SES"}
        </Button>
      </div>
    </form>
  )
}
