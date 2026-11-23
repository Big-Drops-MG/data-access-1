"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { FormField } from "@/components/app/form-field"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useMutationDisabledProps } from "@/components/app/online-status"
import {
  createEmailRoute,
  isEmailRouteConflict,
  type EmailRouteEmailType,
} from "@/features/email-routes/api"
import { ROUTE_EMAIL_TYPE_OPTIONS } from "@/features/email-routes/email-type"
import {
  emailRoutesOutlineControl,
  emailRoutesPrimaryControl,
  emailRoutesSelectContentClass,
  emailRoutesSelectItemClass,
  emailRoutesSelectTriggerClass,
} from "@/features/email-routes/email-routes-ui"
import { useRouteFormOptions } from "@/features/email-routes/use-route-form-options"
import { isApiError } from "@/lib/api-client"
import { listQueryKey } from "@/lib/query-keys"
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

type NewRouteDialogProps = {
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
  const selectedLabel = options.find((option) => option.value === value)?.label

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
        className={emailRoutesSelectTriggerClass}
      >
        <SelectValue
          placeholder={placeholder}
          title={selectedLabel}
          className="block min-w-0 flex-1 truncate text-left"
        />
      </SelectTrigger>
      <SelectContent
        align="start"
        side="bottom"
        sideOffset={8}
        alignItemWithTrigger
        className={emailRoutesSelectContentClass}
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
              className={emailRoutesSelectItemClass}
            >
              {option.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}

const NO_OFFER_VALUE = "__none__"

type NewRouteFormProps = {
  defaultOfferId?: string | null
  onClose: () => void
}

function NewRouteForm({ defaultOfferId = null, onClose }: NewRouteFormProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const [emailType, setEmailType] = useState<EmailRouteEmailType | "">("")
  const [offerId, setOfferId] = useState(
    defaultOfferId?.trim() || NO_OFFER_VALUE
  )
  const [templateId, setTemplateId] = useState("")
  const [senderId, setSenderId] = useState("")

  const selectedOfferId =
    !offerId || offerId === NO_OFFER_VALUE ? null : offerId
  const options = useRouteFormOptions(emailType, selectedOfferId)

  const emailTypeOptions = useMemo(
    () =>
      ROUTE_EMAIL_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    []
  )

  const offerOptions = useMemo(
    () => [
      { value: NO_OFFER_VALUE, label: "No offer (default)" },
      ...options.offers.map((offer) => ({
        value: offer.id,
        label: `${offer.external_ref} · ${offer.name}`,
      })),
    ],
    [options.offers]
  )

  const templateOptions = useMemo(
    () =>
      options.templates.map((template) => ({
        value: template.id,
        label:
          template.current_version_no != null
            ? `${template.name} · v${template.current_version_no}`
            : template.name,
      })),
    [options.templates]
  )

  const senderOptions = useMemo(
    () =>
      options.senders.map((sender) => ({
        value: sender.id,
        label: `${sender.from_name} <${sender.from_email}>`,
      })),
    [options.senders]
  )

  const createMutation = useMutation({
    mutationFn: createEmailRoute,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("email-routes"),
      })
      toast.success("Route created")
      onClose()
    },
    onError: (error) => {
      if (isEmailRouteConflict(error)) {
        toast.error(
          "An active route already exists for this email type and offer"
        )
        return
      }
      toast.error(isApiError(error) ? error.message : "Could not create route")
    },
  })

  const canSubmit =
    Boolean(emailType) &&
    Boolean(offerId) &&
    Boolean(templateId) &&
    Boolean(senderId) &&
    !createMutation.isPending &&
    !mutationDisabled.disabled

  function handleEmailTypeChange(value: string) {
    setEmailType(value as EmailRouteEmailType)
    setTemplateId("")
  }

  function handleOfferChange(value: string) {
    setOfferId(value)
    setTemplateId("")
    setSenderId("")
  }

  function handleSubmit() {
    if (!emailType || !offerId || !templateId || !senderId) {
      return
    }
    createMutation.mutate({
      email_type: emailType,
      offer_id: selectedOfferId,
      template_id: templateId,
      sender_id: senderId,
    })
  }

  return (
    <>
      <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto px-6 pt-6 pb-6">
        <AlertDialogHeader className="w-full min-w-0 place-items-start gap-1.5 text-left">
          <AlertDialogTitle className="text-lg leading-snug font-semibold tracking-tight text-fg">
            New route
          </AlertDialogTitle>
          <AlertDialogDescription className="min-w-0 text-sm leading-relaxed text-pretty text-fg-muted">
            Only one active route can exist for each email type and offer. Use
            No offer for the default thank-you / feedback route used by test
            send.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {options.error ? (
          <InlineErrorCard
            message={
              isApiError(options.error)
                ? options.error.message
                : "Could not load route options."
            }
            requestId={
              isApiError(options.error) ? options.error.requestId : null
            }
            onRetry={options.refetch}
          />
        ) : null}

        <div className="space-y-5">
          <FormField
            id="new-route-email-type"
            label="Email type"
            required
            className="gap-1.5"
            testIdPrefix="new-route"
            name="email_type"
          >
            <OptionSelect
              id="new-route-email-type"
              value={emailType}
              options={emailTypeOptions}
              placeholder="Select email type"
              testId="new-route-email-type"
              onChange={handleEmailTypeChange}
            />
          </FormField>

          <FormField
            id="new-route-offer"
            label="Offer"
            description="Leave as No offer for the default route (required for template test send)."
            required
            className="gap-1.5"
            testIdPrefix="new-route"
            name="offer_id"
          >
            <OptionSelect
              id="new-route-offer"
              value={offerId}
              options={offerOptions}
              placeholder={
                options.lookupsPending ? "Loading offers…" : "Select offer"
              }
              emptyMessage="No active offers. Import an offer first."
              disabled={options.lookupsPending}
              testId="new-route-offer"
              onChange={handleOfferChange}
            />
          </FormField>

          <FormField
            id="new-route-template"
            label="Template"
            description="Published templates for this email type."
            required
            className="gap-1.5"
            testIdPrefix="new-route"
            name="template_id"
          >
            <OptionSelect
              id="new-route-template"
              value={templateId}
              options={templateOptions}
              placeholder={
                !emailType
                  ? "Select email type first"
                  : options.isPending
                    ? "Loading templates…"
                    : templateOptions.length === 0
                      ? "No published templates"
                      : "Select template"
              }
              emptyMessage="No published templates for this email type."
              disabled={!emailType || options.isPending}
              testId="new-route-template"
              onChange={setTemplateId}
            />
          </FormField>

          <FormField
            id="new-route-sender"
            label="Sender"
            description="Active senders on a verified domain."
            required
            className="gap-1.5"
            testIdPrefix="new-route"
            name="sender_id"
          >
            <OptionSelect
              id="new-route-sender"
              value={senderId}
              options={senderOptions}
              placeholder={
                options.lookupsPending
                  ? "Loading senders…"
                  : senderOptions.length === 0
                    ? "No active senders"
                    : "Select sender"
              }
              emptyMessage="No active senders on a verified domain."
              disabled={options.lookupsPending}
              testId="new-route-sender"
              onChange={setSenderId}
            />
          </FormField>
        </div>
      </div>

      <AlertDialogFooter className="m-0 shrink-0 gap-2 rounded-none border-t border-border bg-surface-2 px-6 py-4 group-data-[size=default]/alert-dialog-content:flex sm:justify-end">
        <AlertDialogCancel
          className={emailRoutesOutlineControl()}
          data-testid="new-route-cancel"
        >
          Cancel
        </AlertDialogCancel>
        <button
          type="button"
          className={emailRoutesPrimaryControl()}
          disabled={!canSubmit}
          data-testid="new-route-submit"
          onClick={handleSubmit}
        >
          {createMutation.isPending ? "Creating…" : "Create route"}
        </button>
      </AlertDialogFooter>
    </>
  )
}

export function NewRouteDialog({
  open,
  onOpenChange,
  defaultOfferId = null,
}: NewRouteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="flex max-h-[min(40rem,calc(100dvh-2rem))] w-full max-w-[32rem] min-w-0 flex-col gap-0 overflow-hidden p-0 data-[size=default]:max-w-[32rem] sm:max-w-[32rem] data-[size=default]:sm:max-w-[32rem]"
        size="default"
        data-testid="new-route-dialog"
      >
        {open ? (
          <NewRouteForm
            key={defaultOfferId ?? "default"}
            defaultOfferId={defaultOfferId}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
