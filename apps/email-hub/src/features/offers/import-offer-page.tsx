"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { z } from "zod"

import { FormField } from "@/components/app/form-field"
import { useMutationDisabledProps } from "@/components/app/online-status"
import { PageHeader } from "@/components/app/page-header"
import { importOffer } from "@/features/offers/api"
import {
  offersOutlineControl,
  offersPrimaryControl,
} from "@/features/offers/offers-ui"
import { isApiError, isConflictError } from "@/lib/api-client"
import { applyServerErrors, useAppForm } from "@/lib/form"
import { listQueryKey } from "@/lib/query-keys"

const formCardClass =
  "space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm"

const importOfferFormSchema = z
  .object({
    everflow_offer_id: z
      .string()
      .trim()
      .min(1, "Enter an Everflow offer ID")
      .regex(/^\d+$/, "Everflow offer ID must be a number"),
  })
  .strict()

type ImportOfferFormValues = z.output<typeof importOfferFormSchema>

export function ImportOfferPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()

  const form = useAppForm(importOfferFormSchema, {
    defaultValues: { everflow_offer_id: "" },
  })

  const mutation = useMutation({
    mutationFn: (values: ImportOfferFormValues) =>
      importOffer(Number(values.everflow_offer_id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("offers"),
      })
      toast.success("Offer imported")
      router.push("/offers")
      router.refresh()
    },
    onError: (error) => {
      if (isConflictError(error)) {
        form.setError("everflow_offer_id", {
          type: "server",
          message: "This Everflow offer is already imported",
        })
        return
      }
      const mapped = applyServerErrors(error, form.setError, form.getValues())
      if (isApiError(error)) {
        toast.error(
          mapped.unmapped[0]?.message ??
            error.message ??
            "Could not import offer"
        )
        return
      }
      toast.error("Could not import offer")
    },
  })

  return (
    <div className="space-y-6" data-testid="offers-import-page">
      <PageHeader
        title="Import offer"
        description="Enter an Everflow offer ID. Unsubscribe URL, creatives, and the Optizmo mailer key are pulled automatically."
        breadcrumbs={[
          { label: "Offers", href: "/offers" },
          { label: "Import offer" },
        ]}
      />

      <form
        className={formCardClass}
        onSubmit={form.handleSubmit((values) => {
          mutation.mutate(values)
        })}
        noValidate
      >
        <FormField
          id="offers-everflow-offer-id"
          name="everflow_offer_id"
          label="Everflow offer ID"
          description="Example: 2049"
          error={form.formState.errors.everflow_offer_id?.message}
          testIdPrefix="offers"
          required
        >
          <input
            id="offers-everflow-offer-id"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(form.formState.errors.everflow_offer_id)}
            data-testid="offers-import-id"
            disabled={mutation.isPending || mutationDisabled.disabled}
            {...form.register("everflow_offer_id")}
          />
        </FormField>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={offersPrimaryControl()}
            disabled={mutation.isPending || mutationDisabled.disabled}
            data-testid="offers-import-submit"
          >
            {mutation.isPending ? "Importing…" : "Import offer"}
          </button>
          <Link href="/offers" className={offersOutlineControl()}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
