"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/app/form-field"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useMutationDisabledProps } from "@/components/app/online-status"
import {
  addSuppression,
  fetchActiveOffersForSuppression,
} from "@/features/suppression/api"
import {
  suppressionFieldControlClass,
  suppressionOutlineControl,
  suppressionPrimaryControl,
  suppressionSelectContentClass,
  suppressionSelectItemClass,
  suppressionSelectTriggerClass,
} from "@/features/suppression/suppression-ui"
import { isApiError } from "@/lib/api-client"
import { listQueryKey } from "@/lib/query-keys"
import { listQueryOptions } from "@/lib/query-options"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

type SelectOption = { value: string; label: string }

type AddSuppressionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultOfferId?: string | null
}

type OptionSelectProps = {
  id: string
  value: string
  options: SelectOption[]
  placeholder: string
  emptyMessage?: string
  disabled?: boolean
  testId: string
  onChange: (value: string) => void
}

function OptionSelect({
  id,
  value,
  options,
  placeholder,
  emptyMessage = "No options available",
  disabled,
  testId,
  onChange,
}: OptionSelectProps) {
  const isEmpty = options.length === 0

  return (
    <Select
      value={value || undefined}
      items={options}
      disabled={disabled}
      onValueChange={(next) => {
        if (next != null) {
          onChange(next)
        }
      }}
    >
      <SelectTrigger
        id={id}
        size="default"
        data-testid={testId}
        className={suppressionSelectTriggerClass}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        align="start"
        side="bottom"
        sideOffset={8}
        alignItemWithTrigger
        className={suppressionSelectContentClass}
      >
        {isEmpty ? (
          <p
            className="px-3 py-3 text-sm text-fg-muted"
            data-testid={`${testId}-empty`}
            role="status"
          >
            {emptyMessage}
          </p>
        ) : (
          options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className={suppressionSelectItemClass}
            >
              {option.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}

type AddSuppressionFormProps = {
  defaultOfferId?: string | null
  onClose: () => void
}

function AddSuppressionForm({
  defaultOfferId = null,
  onClose,
}: AddSuppressionFormProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const [email, setEmail] = useState("")
  const [offerId, setOfferId] = useState(defaultOfferId?.trim() || "")

  const offersQuery = useQuery({
    ...listQueryOptions("suppression-form-offers", () =>
      fetchActiveOffersForSuppression()
    ),
  })

  const offerOptions = useMemo(
    () =>
      (offersQuery.data?.data ?? []).map((offer) => ({
        value: offer.id,
        label: `${offer.external_ref} · ${offer.name}`,
      })),
    [offersQuery.data?.data]
  )

  const addMutation = useMutation({
    mutationFn: addSuppression,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("suppressions"),
      })
      toast.success(
        result.created
          ? "Address added to suppression"
          : "Address was already suppressed"
      )
      onClose()
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not add suppression"
      )
    },
  })

  const canSubmit =
    Boolean(email.trim()) &&
    Boolean(offerId) &&
    !addMutation.isPending &&
    !mutationDisabled.disabled

  function handleSubmit() {
    const trimmed = email.trim()
    if (!trimmed || !offerId) {
      return
    }
    addMutation.mutate({ email: trimmed, offer_id: offerId })
  }

  return (
    <>
      <div className="space-y-6 px-6 pt-6 pb-6">
        <AlertDialogHeader className="place-items-start gap-1.5 text-left">
          <AlertDialogTitle className="text-lg leading-snug font-semibold tracking-tight text-fg">
            Add to suppression
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-fg-muted">
            This address won&apos;t get engagement or feedback emails. Thank-you
            emails still go out unless the reason is a hard bounce or complaint.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {offersQuery.isError ? (
          <InlineErrorCard
            message={
              isApiError(offersQuery.error)
                ? offersQuery.error.message
                : "Could not load offers."
            }
            requestId={
              isApiError(offersQuery.error) ? offersQuery.error.requestId : null
            }
            onRetry={() => {
              void offersQuery.refetch()
            }}
          />
        ) : null}

        <div className="space-y-5">
          <FormField
            id="add-suppression-email"
            label="Email"
            required
            className="gap-1.5"
            testIdPrefix="add-suppression"
            name="email"
          >
            <input
              id="add-suppression-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className={suppressionFieldControlClass}
              data-testid="add-suppression-email"
            />
          </FormField>

          <FormField
            id="add-suppression-offer"
            label="Offer"
            required
            className="gap-1.5"
            testIdPrefix="add-suppression"
            name="offer_id"
          >
            <OptionSelect
              id="add-suppression-offer"
              value={offerId}
              options={offerOptions}
              placeholder={
                offersQuery.isPending
                  ? "Loading offers…"
                  : offerOptions.length === 0
                    ? "No offers available"
                    : "Select offer"
              }
              emptyMessage="No active offers. Import an offer first."
              disabled={offersQuery.isPending}
              testId="add-suppression-offer"
              onChange={setOfferId}
            />
          </FormField>

          <FormField
            id="add-suppression-reason"
            label="Reason"
            description="Saved in the audit log as a manual suppression."
            className="gap-1.5"
            testIdPrefix="add-suppression"
            name="reason"
          >
            <input
              id="add-suppression-reason"
              type="text"
              value="Manual"
              disabled
              className={suppressionFieldControlClass}
              data-testid="add-suppression-reason"
            />
          </FormField>
        </div>
      </div>

      <AlertDialogFooter className="m-0 gap-2 rounded-none border-t border-border bg-surface-2 px-6 py-4 group-data-[size=default]/alert-dialog-content:flex sm:justify-end">
        <AlertDialogCancel
          className={suppressionOutlineControl()}
          data-testid="add-suppression-cancel"
        >
          Cancel
        </AlertDialogCancel>
        <button
          type="button"
          className={suppressionPrimaryControl()}
          disabled={!canSubmit}
          data-testid="add-suppression-submit"
          onClick={handleSubmit}
        >
          {addMutation.isPending ? "Adding…" : "Add address"}
        </button>
      </AlertDialogFooter>
    </>
  )
}

export function AddSuppressionDialog({
  open,
  onOpenChange,
  defaultOfferId = null,
}: AddSuppressionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-[32rem] gap-0 overflow-hidden p-0 data-[size=default]:max-w-[32rem] sm:max-w-[32rem] data-[size=default]:sm:max-w-[32rem]"
        size="default"
        data-testid="add-suppression-dialog"
      >
        {open ? (
          <AddSuppressionForm
            key={defaultOfferId ?? "default"}
            defaultOfferId={defaultOfferId}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
