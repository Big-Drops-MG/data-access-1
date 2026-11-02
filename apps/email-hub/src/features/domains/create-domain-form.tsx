"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { FormField } from "@/components/app/form-field"
import { useMutationDisabledProps } from "@/components/app/online-status"
import { createDomain } from "@/features/domains/api"
import { createDomainBodySchema } from "@/lib/domains/schemas"
import { applyServerErrors, useAppForm } from "@/lib/form"
import { listQueryKey } from "@/lib/query-keys"
import { Button } from "@workspace/ui/components/button"

type CreateDomainFormProps = {
  onCancel?: () => void
  onSuccess?: (domainId: string) => void
}

/**
 * Domain create form using the shared form kit (T-061 / SD#12.6).
 * Schema matches POST /api/domains body validation.
 */
export function CreateDomainForm({
  onCancel,
  onSuccess,
}: CreateDomainFormProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const form = useAppForm(createDomainBodySchema, {
    defaultValues: { name: "" },
  })

  const create = useMutation({
    mutationFn: (name: string) => createDomain(name),
    meta: {
      skipConflictDialog: true,
      conflictInvalidateKeys: [listQueryKey("domains")],
    },
    onSuccess: async (domain) => {
      form.reset({ name: "" })
      await queryClient.invalidateQueries({ queryKey: listQueryKey("domains") })
      toast.success("Domain created")
      onSuccess?.(domain.id)
    },
  })

  const submitDisabled =
    create.isPending || form.formState.isSubmitting || mutationDisabled.disabled

  return (
    <form
      className="space-y-4 rounded-md border border-border bg-surface p-4"
      data-testid="domains-create-form"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        if (mutationDisabled.disabled) {
          return
        }
        create.mutate(values.name, {
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
        })
      })}
    >
      <FormField
        id="domains-create-name"
        name="name"
        label="Domain name"
        required
        description="Lowercase FQDN, for example mail.example.com"
        error={form.formState.errors.name?.message}
        testIdPrefix="domains"
      >
        <input
          id="domains-create-name"
          type="text"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(form.formState.errors.name)}
          data-testid="domains-create-name"
          disabled={create.isPending || mutationDisabled.disabled}
          {...form.register("name")}
        />
      </FormField>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={submitDisabled}
          title={mutationDisabled.title}
          data-testid="domains-create-submit"
        >
          {create.isPending ? "Creating…" : "Add domain"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={create.isPending}
            onClick={onCancel}
            data-testid="domains-create-cancel"
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
