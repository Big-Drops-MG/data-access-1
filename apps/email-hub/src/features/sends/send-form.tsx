"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EtDateTime } from "@/components/app/et-datetime"
import { EtDateTimePicker } from "@/components/app/et-datetime-picker"
import { FormField } from "@/components/app/form-field"
import { useMutationDisabledProps } from "@/components/app/online-status"
import {
  createSend,
  isSendLockedConflict,
  scheduleSend,
  updateSend,
  type OfferOption,
  type SenderRow,
  type SendListItem,
  type TemplateRow,
} from "@/features/sends/api"
import {
  buildOfferOptions,
  buildSenderOptions,
  buildTemplateOptions,
  isScheduleLeadValid,
  sendFormDefaults,
  sendFormSchema,
  toSendPayload,
  type SelectOption,
  type SendFormValues,
} from "@/features/sends/send-form-model"
import {
  sendsFieldControlClass,
  sendsFieldStackClass,
  sendsOutlineControl,
  sendsPrimaryControl,
  sendsSectionClass,
  sendsSelectContentClass,
  sendsSelectItemClass,
  sendsSelectTriggerClass,
} from "@/features/sends/sends-ui"
import { isApiError } from "@/lib/api-client"
import { applyServerErrors, useAppForm } from "@/lib/form"
import { detailQueryKey, listQueryKey } from "@/lib/query-keys"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

const headingClass = "text-base font-semibold tracking-tight text-fg"

type SendFormProps = {
  mode: "create" | "edit"
  initial?: SendListItem
  templates: TemplateRow[]
  senders: SenderRow[]
  offers: OfferOption[]
  onSaved: (send: SendListItem) => void
  onLocked?: () => void
  className?: string
}

type SubmitInput = {
  values: SendFormValues
  schedule: boolean
}

type SubmitResult = {
  send: SendListItem
  scheduleError: unknown
}

type OptionSelectProps = {
  id: string
  value: string
  options: SelectOption[]
  placeholder: string
  disabled: boolean
  invalid: boolean
  testId: string
  onChange: (value: string) => void
}

function OptionSelect({
  id,
  value,
  options,
  placeholder,
  disabled,
  invalid,
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
        aria-invalid={invalid}
        data-testid={testId}
        className={sendsSelectTriggerClass}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        align="start"
        side="bottom"
        sideOffset={8}
        alignItemWithTrigger
        className={sendsSelectContentClass}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={sendsSelectItemClass}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SendForm({
  mode,
  initial,
  templates,
  senders,
  offers,
  onSaved,
  onLocked,
  className,
}: SendFormProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const [scheduleValues, setScheduleValues] = useState<SendFormValues | null>(
    null
  )

  const templateOptions = buildTemplateOptions(templates, initial)
  const senderOptions = buildSenderOptions(senders, initial)
  const offerOptions = buildOfferOptions(offers, initial)

  const form = useAppForm(sendFormSchema, {
    defaultValues: sendFormDefaults(initial),
  })

  const watched = form.watch()
  const selectedTemplate = templateOptions.find(
    (option) => option.versionId === watched.template_version_id
  )
  const selectedSender = senderOptions.find(
    (option) => option.value === watched.sender_id
  )
  const selectedOffer = offerOptions.find(
    (option) => option.value === watched.offer_id
  )

  const submit = useMutation({
    mutationFn: async ({
      values,
      schedule,
    }: SubmitInput): Promise<SubmitResult> => {
      const payload = toSendPayload(values)
      const saved =
        mode === "create" || !initial
          ? await createSend(payload)
          : await updateSend(initial.id, {
              ...payload,
              version: initial.version,
            })
      if (!schedule) {
        return { send: saved, scheduleError: null }
      }
      try {
        const scheduled = await scheduleSend(saved.id, saved.version)
        return { send: scheduled, scheduleError: null }
      } catch (error) {
        return { send: saved, scheduleError: error }
      }
    },
    meta: {
      skipConflictDialog: true,
      conflictInvalidateKeys: [listQueryKey("sends")],
    },
    onSuccess: async ({ send, scheduleError }, variables) => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey("sends") })
      await queryClient.invalidateQueries({
        queryKey: detailQueryKey("sends", send.id),
      })
      if (scheduleError) {
        toast.error(
          `Draft saved, but it could not be scheduled: ${
            isApiError(scheduleError)
              ? (scheduleError.details[0]?.message ?? scheduleError.message)
              : "unexpected error"
          }`
        )
        onSaved(send)
        return
      }
      toast.success(variables.schedule ? "Send scheduled" : "Draft saved")
      onSaved(send)
    },
  })

  function handleError(error: unknown) {
    if (isSendLockedConflict(error)) {
      onLocked?.()
      return
    }
    if (isApiError(error) && error.status === 409) {
      if (initial) {
        void queryClient.invalidateQueries({
          queryKey: detailQueryKey("sends", initial.id),
        })
      }
      toast.error(
        "This send was changed by someone else. Reload the page and try again."
      )
      return
    }
    const { fieldMapped, unmapped } = applyServerErrors(
      error,
      form.setError,
      form.getValues()
    )
    if (!fieldMapped || unmapped.length > 0) {
      toast.error(
        unmapped[0]?.message ??
          (error instanceof Error ? error.message : "Could not save send")
      )
    }
  }

  const pending = submit.isPending
  const controlsDisabled = pending || mutationDisabled.disabled

  function setField(key: keyof SendFormValues, value: string) {
    form.setValue(key, value, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    })
  }

  const saveDraft = form.handleSubmit((values) => {
    if (mutationDisabled.disabled) {
      return
    }
    submit.mutate({ values, schedule: false }, { onError: handleError })
  })

  const requestSchedule = form.handleSubmit((values) => {
    if (mutationDisabled.disabled) {
      return
    }
    if (!isScheduleLeadValid(values.scheduled_for)) {
      form.setError("scheduled_for", {
        type: "manual",
        message: "Schedule at least 5 minutes from now.",
      })
      return
    }
    setScheduleValues(values)
  })

  const scheduledError = form.formState.errors.scheduled_for?.message

  return (
    <div
      className={cn(
        "grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:gap-10",
        className
      )}
    >
      <form
        className="space-y-8"
        data-testid="sends-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void saveDraft()
        }}
      >
        <section
          className={sendsSectionClass}
          aria-labelledby="send-details-heading"
        >
          <h2 id="send-details-heading" className={headingClass}>
            Details
          </h2>
          <FormField
            id="send-name"
            name="name"
            label="Send name"
            required
            error={form.formState.errors.name?.message}
            testIdPrefix="send"
            className={sendsFieldStackClass}
          >
            <input
              id="send-name"
              type="text"
              autoComplete="off"
              placeholder="e.g. Engagement · November push"
              aria-invalid={Boolean(form.formState.errors.name)}
              disabled={controlsDisabled}
              className={sendsFieldControlClass}
              {...form.register("name")}
            />
          </FormField>

          <div className="grid gap-7 sm:grid-cols-2 sm:gap-6">
            <FormField
              id="send-template"
              name="template_version_id"
              label="Template"
              required
              description="Published templates only."
              error={form.formState.errors.template_version_id?.message}
              testIdPrefix="send"
              className={sendsFieldStackClass}
            >
              <OptionSelect
                id="send-template"
                value={watched.template_version_id}
                options={templateOptions.map((option) => ({
                  value: option.versionId,
                  label: option.label,
                }))}
                placeholder="Select template"
                disabled={controlsDisabled}
                invalid={Boolean(form.formState.errors.template_version_id)}
                testId="send-template"
                onChange={(versionId) => {
                  const option = templateOptions.find(
                    (item) => item.versionId === versionId
                  )
                  setField("template_version_id", versionId)
                  if (option) {
                    setField("category_id", option.categoryId)
                  }
                }}
              />
            </FormField>

            <FormField
              id="send-category"
              name="category_id"
              label="Preference category"
              description="Filled from the template."
              testIdPrefix="send"
              className={sendsFieldStackClass}
            >
              <input
                id="send-category"
                className={sendsFieldControlClass}
                value={selectedTemplate?.categoryName ?? "—"}
                readOnly
                disabled
              />
            </FormField>

            <FormField
              id="send-sender"
              name="sender_id"
              label="Sender"
              required
              description="Active senders on verified domains."
              error={form.formState.errors.sender_id?.message}
              testIdPrefix="send"
              className={sendsFieldStackClass}
            >
              <OptionSelect
                id="send-sender"
                value={watched.sender_id}
                options={senderOptions}
                placeholder="Select sender"
                disabled={controlsDisabled}
                invalid={Boolean(form.formState.errors.sender_id)}
                testId="send-sender"
                onChange={(value) => setField("sender_id", value)}
              />
            </FormField>

            <FormField
              id="send-offer"
              name="offer_id"
              label="Offer"
              description="Optional. All offers sends without an offer filter."
              error={form.formState.errors.offer_id?.message}
              testIdPrefix="send"
              className={sendsFieldStackClass}
            >
              <OptionSelect
                id="send-offer"
                value={watched.offer_id}
                options={offerOptions}
                placeholder="All offers"
                disabled={controlsDisabled}
                invalid={Boolean(form.formState.errors.offer_id)}
                testId="send-offer"
                onChange={(value) => setField("offer_id", value)}
              />
            </FormField>
          </div>
        </section>

        <section
          className={sendsSectionClass}
          aria-labelledby="send-schedule-heading"
        >
          <h2 id="send-schedule-heading" className={headingClass}>
            Schedule
          </h2>
          <div className="space-y-3">
            <EtDateTimePicker
              value={watched.scheduled_for}
              disabled={controlsDisabled}
              data-testid="send-scheduled-for"
              dateLabel="Send date (ET)"
              timeLabel="Send time (ET)"
              showUtcPreview={false}
              onChange={(utc) => setField("scheduled_for", utc.toISOString())}
            />
            {scheduledError ? (
              <p
                className="text-caption text-destructive"
                role="alert"
                data-testid="send-scheduled-for-error"
              >
                {scheduledError}
              </p>
            ) : null}
            <p className="text-caption text-fg-muted">
              Scheduling needs at least 5 minutes of lead time. Times are
              Eastern and follow daylight saving changes.
            </p>
          </div>
        </section>

        <section
          className={sendsSectionClass}
          aria-labelledby="send-headers-heading"
        >
          <h2 id="send-headers-heading" className={headingClass}>
            Headers
          </h2>
          <FormField
            id="send-list-unsubscribe"
            label="List-Unsubscribe"
            description="Unique unsubscribe link added to every message at send time."
            className={sendsFieldStackClass}
          >
            <input
              id="send-list-unsubscribe"
              className={cn(sendsFieldControlClass, "font-mono text-[13px]")}
              value="<per-recipient unsubscribe URL>"
              readOnly
              disabled
            />
          </FormField>
          <FormField
            id="send-list-unsubscribe-post"
            label="List-Unsubscribe-Post"
            description="One-click unsubscribe where the recipient mail client supports it."
            className={sendsFieldStackClass}
          >
            <input
              id="send-list-unsubscribe-post"
              className={cn(sendsFieldControlClass, "font-mono text-[13px]")}
              value="List-Unsubscribe=One-Click"
              readOnly
              disabled
            />
          </FormField>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={
              initial ? `/sends/${encodeURIComponent(initial.id)}` : "/sends"
            }
            className={sendsOutlineControl()}
            data-testid="send-form-cancel"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={controlsDisabled}
            title={mutationDisabled.title}
            data-testid="send-save-draft"
            className={sendsOutlineControl()}
          >
            {pending ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            disabled={controlsDisabled}
            title={mutationDisabled.title}
            data-testid="send-schedule"
            className={sendsPrimaryControl()}
            onClick={() => {
              void requestSchedule()
            }}
          >
            Schedule
          </button>
        </div>
      </form>

      <aside
        className={cn(sendsSectionClass, "space-y-5 lg:sticky lg:top-6")}
        aria-labelledby="send-checklist-heading"
        data-testid="send-checklist"
      >
        <h2 id="send-checklist-heading" className={headingClass}>
          Before it goes out
        </h2>
        <dl className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-fg-muted">Template</dt>
            <dd className="min-w-0 truncate text-right text-fg">
              {selectedTemplate?.label ?? "Not selected"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-fg-muted">Sender</dt>
            <dd className="min-w-0 truncate text-right text-fg">
              {selectedSender?.label ?? "Not selected"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-fg-muted">Offer</dt>
            <dd className="min-w-0 truncate text-right text-fg">
              {selectedOffer?.label ?? "All offers"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-fg-muted">Scheduled</dt>
            <dd className="text-right">
              <EtDateTime
                value={watched.scheduled_for}
                className="text-sm text-fg"
              />
            </dd>
          </div>
        </dl>
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-fg">Will send to</h3>
          <p className="text-caption text-fg-muted">
            Recipient estimates run at send time. Recipients who are suppressed,
            opted out, or over the frequency cap are skipped when dispatch
            starts, so no count is shown here.
          </p>
        </div>
        <p className="text-caption text-fg-muted">
          Scheduling locks this configuration. After that, cancel the send and
          create a new one to change it.
        </p>
      </aside>

      <ConfirmDialog
        open={scheduleValues != null}
        onOpenChange={(open) => {
          if (!open) {
            setScheduleValues(null)
          }
        }}
        title="Schedule this send?"
        description="Once scheduled, the configuration is locked. You can still cancel it before it finishes."
        confirmLabel="Schedule send"
        confirmPhrase={scheduleValues?.name.trim()}
        onConfirm={() => {
          if (scheduleValues) {
            submit.mutate(
              { values: scheduleValues, schedule: true },
              { onError: handleError }
            )
          }
        }}
      />
    </div>
  )
}
