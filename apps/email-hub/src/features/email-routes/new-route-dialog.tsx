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

const DEFAULT_OFFER_VALUE = "__default__"

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
  disabled?: boolean
  testId: string
  onChange: (value: string) => void
}

function OptionSelect({
  id,
  value,
  options,
  placeholder,
  disabled,
  testId,
  onChange,
}: OptionSelectProps) {
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
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        align="start"
        side="bottom"
        sideOffset={8}
        alignItemWithTrigger
        className={emailRoutesSelectContentClass}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={emailRoutesSelectItemClass}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type NewRouteFormProps = {
  defaultOfferId?: string | null
  onClose: () => void
}

function NewRouteForm({ defaultOfferId = null, onClose }: NewRouteFormProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const [emailType, setEmailType] = useState<EmailRouteEmailType | "">("")
  const [offerValue, setOfferValue] = useState(
    defaultOfferId?.trim() || DEFAULT_OFFER_VALUE
  )
  const [templateId, setTemplateId] = useState("")
  const [senderId, setSenderId] = useState("")

  const selectedOfferId = offerValue === DEFAULT_OFFER_VALUE ? null : offerValue
  const options = useRouteFormOptions(emailType, selectedOfferId)

  const emailTypeOptions = useMemo(
    () =>
      ROUTE_EMAIL_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    []
  )

  const offerOptions = useMemo(() => {
    const rows: SelectOption[] = [
      { value: DEFAULT_OFFER_VALUE, label: "Default (no offer)" },
    ]
    for (const offer of options.offers) {
      rows.push({
        value: offer.id,
        label: `${offer.external_ref} · ${offer.name}`,
      })
    }
    return rows
  }, [options.offers])

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
    Boolean(templateId) &&
    Boolean(senderId) &&
    !createMutation.isPending &&
    !mutationDisabled.disabled

  function handleEmailTypeChange(value: string) {
    setEmailType(value as EmailRouteEmailType)
    setTemplateId("")
  }

  function handleOfferChange(value: string) {
    setOfferValue(value)
    setTemplateId("")
    setSenderId("")
  }

  function handleSubmit() {
    if (!emailType || !templateId || !senderId) {
      return
    }
    createMutation.mutate({
      email_type: emailType,
      offer_id: offerValue === DEFAULT_OFFER_VALUE ? null : offerValue,
      template_id: templateId,
      sender_id: senderId,
    })
  }

  return (
    <>
      <div className="space-y-6 px-6 pt-6 pb-6">
        <AlertDialogHeader className="place-items-start gap-1.5 text-left">
          <AlertDialogTitle className="text-lg leading-snug font-semibold tracking-tight text-fg">
            New route
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-fg-muted">
            Only one active route can exist for each email type and offer.
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
            required
            className="gap-1.5"
            testIdPrefix="new-route"
            name="offer_id"
          >
            <OptionSelect
              id="new-route-offer"
              value={offerValue}
              options={offerOptions}
              placeholder="Select offer"
              disabled={options.lookupsPending}
              testId="new-route-offer"
              onChange={handleOfferChange}
            />
          </FormField>

          <FormField
            id="new-route-template"
            label="Template"
            description={
              selectedOfferId
                ? "Published templates linked to this offer (or a default route)."
                : "Published templates of this email type."
            }
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
                emailType
                  ? options.isPending
                    ? "Loading templates…"
                    : "Select template"
                  : "Select email type first"
              }
              disabled={!emailType || options.isPending}
              testId="new-route-template"
              onChange={setTemplateId}
            />
          </FormField>

          <FormField
            id="new-route-sender"
            label="Sender"
            description={
              selectedOfferId
                ? "Active senders linked to this offer (or a default route)."
                : "Active senders on active domains."
            }
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
                options.lookupsPending ? "Loading senders…" : "Select sender"
              }
              disabled={options.lookupsPending}
              testId="new-route-sender"
              onChange={setSenderId}
            />
          </FormField>
        </div>
      </div>

      <AlertDialogFooter className="m-0 gap-2 rounded-none border-t border-border bg-surface-2 px-6 py-4 group-data-[size=default]/alert-dialog-content:flex sm:justify-end">
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
        className="max-w-[32rem] gap-0 overflow-hidden p-0 data-[size=default]:max-w-[32rem] sm:max-w-[32rem] data-[size=default]:sm:max-w-[32rem]"
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
