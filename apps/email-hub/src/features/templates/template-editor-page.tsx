"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { FormField } from "@/components/app/form-field"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useMutationDisabledProps } from "@/components/app/online-status"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import {
  createTemplate,
  createTemplateVersion,
  fetchEmailCategories,
  fetchTemplate,
  previewTemplate,
  publishTemplateVersion,
  testSendTemplate,
  type EmailType,
  type TemplateDetail,
} from "@/features/templates/api"
import {
  EMAIL_TYPE_OPTIONS,
  preferenceCategoryLabel,
} from "@/features/templates/email-type"
import {
  buildMergeTagChips,
  engagementComplianceMessage,
  PREVIEW_SAMPLE_MERGE,
  publishBlockMessage,
} from "@/features/templates/merge-tags"
import { TemplatePreviewFrame } from "@/features/templates/template-preview-frame"
import { templatePublishLabel } from "@/features/templates/template-status"
import { TemplateVersionsPanel } from "@/features/templates/template-versions-panel"
import {
  templatesFieldControlClass,
  templatesFieldStackClass,
  templatesOutlineControl,
  templatesPrimaryControl,
  templatesSectionClass,
  templatesSelectContentClass,
  templatesSelectItemClass,
  templatesSelectTriggerClass,
  templatesTextareaClass,
} from "@/features/templates/templates-ui"
import { isApiError } from "@/lib/api-client"
import { applyServerErrors, useAppForm } from "@/lib/form"
import { detailQueryKey, listQueryKey } from "@/lib/query-keys"
import { detailQueryOptions, listQueryOptions } from "@/lib/query-options"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

const emailTypeSchema = z.enum(["thank_you", "feedback_request", "engagement"])

type EditorFormValues = {
  name: string
  email_type: string
  subject: string
  body_source: string
}

const editorSchema = z
  .object({
    name: z.string().trim().min(1, "Template name is required").max(200),
    email_type: z.string(),
    subject: z.string().min(1, "Subject is required").max(998),
    body_source: z.string().min(1, "HTML source is required").max(500_000),
  })
  .strict()
  .superRefine((values, ctx) => {
    if (!emailTypeSchema.safeParse(values.email_type).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose an email type",
        path: ["email_type"],
      })
    }
  })

type TemplateEditorPageProps = {
  mode: "create" | "edit"
  templateId?: string
  canWrite: boolean
  operatorEmail?: string | null
}

function checklistItems(input: {
  name: string
  emailType: string
  subject: string
  body: string
  hasVersion: boolean
}): { id: string; label: string; done: boolean }[] {
  return [
    {
      id: "name",
      label: "Add a template name",
      done: input.name.trim().length > 0,
    },
    {
      id: "type",
      label: "Choose an email type",
      done: input.emailType.length > 0,
    },
    {
      id: "subject",
      label: "Add a subject line",
      done: input.subject.trim().length > 0,
    },
    {
      id: "html",
      label: "Add HTML content",
      done: input.body.trim().length > 0,
    },
    {
      id: "draft",
      label: input.hasVersion ? "First draft saved" : "Create the first draft",
      done: input.hasVersion,
    },
  ]
}

export function TemplateEditorPage({
  mode,
  templateId,
  canWrite,
  operatorEmail = null,
}: TemplateEditorPageProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()

  const detailQuery = useQuery({
    ...detailQueryOptions("templates", templateId ?? "", () =>
      fetchTemplate(templateId!)
    ),
    enabled: mode === "edit" && Boolean(templateId),
  })

  const categoriesQuery = useQuery({
    ...listQueryOptions("email-categories", () => fetchEmailCategories()),
    enabled: mode === "create" || canWrite,
  })

  const template = detailQuery.data ?? null
  const categories = useMemo(
    () => categoriesQuery.data?.data ?? [],
    [categoriesQuery.data?.data]
  )

  const latestVersion = template?.versions[0] ?? null
  const publishedVersion =
    template?.versions.find((v) => v.id === template.current_version_id) ?? null
  const defaultVersionId =
    template?.current_version_id ?? template?.versions[0]?.id ?? null

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null
  )
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const activeVersionId = selectedVersionId ?? defaultVersionId

  const form = useAppForm(editorSchema, {
    defaultValues: {
      name: "",
      email_type: "",
      subject: "",
      body_source: "",
    },
  })
  const dirty = form.formState.isDirty || mode === "create"

  useEffect(() => {
    if (mode !== "edit" || !template || !activeVersionId) {
      return
    }
    const version =
      template.versions.find((item) => item.id === activeVersionId) ?? null
    if (!version) {
      return
    }
    form.reset({
      name: template.name,
      email_type: template.email_type,
      subject: version.subject,
      body_source: version.body_source,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load selected version into the form
  }, [mode, template?.id, activeVersionId, latestVersion?.id])

  const watchedName = form.watch("name")
  const watchedType = form.watch("email_type")
  const watchedSubject = form.watch("subject")
  const watchedBody = form.watch("body_source")
  const canPreview = Boolean(watchedSubject?.trim() && watchedBody?.trim())

  const selectedCategory = useMemo(() => {
    if (!watchedType) {
      return undefined
    }
    return categories.find((category) => category.key === watchedType)
  }, [categories, watchedType])

  const emailTypeValue = (watchedType || undefined) as EmailType | undefined

  const mergeChips = useMemo(
    () =>
      buildMergeTagChips(
        emailTypeValue,
        watchedSubject ?? "",
        watchedBody ?? ""
      ),
    [emailTypeValue, watchedSubject, watchedBody]
  )

  const complianceNote = engagementComplianceMessage(
    emailTypeValue,
    watchedBody ?? ""
  )
  const blockMessage = publishBlockMessage(
    emailTypeValue,
    watchedSubject ?? "",
    watchedBody ?? ""
  )

  const checklist = checklistItems({
    name: watchedName ?? "",
    emailType: watchedType ?? "",
    subject: watchedSubject ?? "",
    body: watchedBody ?? "",
    hasVersion: (template?.versions.length ?? 0) > 0,
  })

  const previewMutation = useMutation({
    mutationFn: () =>
      previewTemplate({
        subject: watchedSubject,
        body_source: watchedBody,
        merge_data:
          emailTypeValue === "engagement"
            ? Object.fromEntries(
                Object.entries(PREVIEW_SAMPLE_MERGE).filter(
                  ([key]) => key !== "tier_label"
                )
              )
            : PREVIEW_SAMPLE_MERGE,
      }),
    onSuccess: (result) => {
      setPreviewHtml(result.html)
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not render preview"
      )
    },
  })

  useEffect(() => {
    if (!canPreview) {
      return
    }
    const handle = window.setTimeout(() => {
      previewMutation.mutate()
    }, 450)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on content only
  }, [watchedSubject, watchedBody, watchedType, canPreview])

  const displayPreviewHtml = canPreview ? previewHtml : null

  function mapFormError(error: unknown, fallback: string) {
    const { fieldMapped, unmapped } = applyServerErrors(
      error,
      form.setError,
      form.getValues()
    )
    if (!fieldMapped || unmapped.length > 0) {
      toast.error(unmapped[0]?.message ?? fallback)
    }
  }

  const createDraftMutation = useMutation({
    mutationFn: async (values: EditorFormValues) => {
      const emailType = emailTypeSchema.parse(values.email_type)
      const category = categories.find((item) => item.key === emailType)
      if (!category) {
        throw new Error("No preference category matches that email type.")
      }
      const created = await createTemplate({
        name: values.name,
        category_id: category.id,
        email_type: emailType,
      })
      await createTemplateVersion(created.id, {
        subject: values.subject,
        body_source: values.body_source,
      })
      return created
    },
    meta: { skipConflictDialog: true },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("templates"),
      })
      toast.success("Draft created")
      router.push(`/templates/${encodeURIComponent(created.id)}`)
    },
    onError: (error) => {
      mapFormError(
        error,
        error instanceof Error ? error.message : "Could not create draft"
      )
    },
  })

  const saveVersionMutation = useMutation({
    mutationFn: async (values: EditorFormValues) => {
      if (!templateId) {
        throw new Error("Missing template id")
      }
      return createTemplateVersion(templateId, {
        subject: values.subject,
        body_source: values.body_source,
      })
    },
    meta: { skipConflictDialog: true },
    onSuccess: async (version) => {
      await queryClient.invalidateQueries({
        queryKey: detailQueryKey("templates", templateId!),
      })
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("templates"),
      })
      setSelectedVersionId(version.id)
      toast.success(`Saved v${version.version_no}`)
    },
    onError: (error) => {
      mapFormError(error, "Could not save version")
    },
  })

  const publishMutation = useMutation({
    mutationFn: async (versionId: string) => {
      if (!templateId) {
        throw new Error("Missing template id")
      }
      return publishTemplateVersion(templateId, versionId)
    },
    meta: { skipConflictDialog: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: detailQueryKey("templates", templateId!),
      })
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("templates"),
      })
      toast.success("Template published")
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.message : "Could not publish")
    },
  })

  const testSendMutation = useMutation({
    mutationFn: async () => {
      if (!templateId || !activeVersionId) {
        throw new Error("Save a version before sending a test")
      }
      return testSendTemplate(templateId, activeVersionId, PREVIEW_SAMPLE_MERGE)
    },
    meta: { skipConflictDialog: true },
    onSuccess: () => {
      toast.success(
        operatorEmail ? `Test queued for ${operatorEmail}` : "Test email queued"
      )
    },
    onError: (error) => {
      toast.error(isApiError(error) ? error.message : "Could not send test")
    },
  })

  const canCreateDraft =
    canWrite &&
    mode === "create" &&
    checklist.slice(0, 4).every((item) => item.done) &&
    !createDraftMutation.isPending

  const canSaveVersion =
    canWrite &&
    mode === "edit" &&
    dirty &&
    Boolean(watchedSubject?.trim()) &&
    Boolean(watchedBody?.trim()) &&
    !saveVersionMutation.isPending

  const canPublish =
    canWrite &&
    mode === "edit" &&
    Boolean(activeVersionId) &&
    !dirty &&
    !blockMessage &&
    !publishMutation.isPending

  const title =
    mode === "create" ? "New template" : (template?.name ?? "Template")

  const statusLabel = template
    ? templatePublishLabel(template)
    : mode === "create"
      ? "Unsaved"
      : null

  if (mode === "edit" && detailQuery.isError) {
    return (
      <InlineErrorCard
        message={
          isApiError(detailQuery.error)
            ? detailQuery.error.message
            : "Could not load template."
        }
        requestId={
          isApiError(detailQuery.error) ? detailQuery.error.requestId : null
        }
        onRetry={() => {
          void detailQuery.refetch()
        }}
      />
    )
  }

  return (
    <div className="space-y-8" data-testid="template-editor-page">
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: "Templates", href: "/templates" },
          { label: mode === "create" ? "New template" : title },
        ]}
        titleBadge={
          statusLabel ? (
            <StatusBadge
              variant={
                statusLabel === "Published"
                  ? "ok"
                  : statusLabel === "Draft" || statusLabel === "Unsaved"
                    ? "neutral"
                    : "neutral"
              }
            >
              {mode === "edit" && latestVersion
                ? statusLabel === "Published" && publishedVersion
                  ? `Published v${publishedVersion.version_no}`
                  : `${statusLabel} v${latestVersion.version_no}`
                : statusLabel}
            </StatusBadge>
          ) : null
        }
        meta={
          template ? (
            <span className="font-mono text-[12px] text-fg-muted">
              {template.id}
              <span className="mx-2 text-border">·</span>
              {template.email_type}
              <span className="mx-2 text-border">·</span>
              {template.category_name}
            </span>
          ) : null
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {mode === "edit" ? (
              <button
                type="button"
                className={templatesOutlineControl()}
                disabled={
                  !canWrite ||
                  !activeVersionId ||
                  dirty ||
                  testSendMutation.isPending ||
                  mutationDisabled.disabled
                }
                onClick={() => testSendMutation.mutate()}
                data-testid="template-test-send"
              >
                Send test to me
              </button>
            ) : (
              <button
                type="button"
                className={templatesOutlineControl()}
                disabled
                data-testid="template-test-send"
              >
                Send test to me
              </button>
            )}
            <Link
              href="/templates"
              className={templatesOutlineControl()}
              data-testid="template-cancel"
            >
              Cancel
            </Link>
            {mode === "create" ? (
              <button
                type="button"
                className={templatesPrimaryControl()}
                disabled={!canCreateDraft || mutationDisabled.disabled}
                onClick={form.handleSubmit((values) =>
                  createDraftMutation.mutate(values)
                )}
                data-testid="template-create-draft"
              >
                Create draft
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={templatesOutlineControl()}
                  disabled={!canSaveVersion || mutationDisabled.disabled}
                  onClick={form.handleSubmit((values) =>
                    saveVersionMutation.mutate(values)
                  )}
                  data-testid="template-save-version"
                >
                  Save version
                </button>
                <button
                  type="button"
                  className={templatesPrimaryControl()}
                  disabled={!canPublish || mutationDisabled.disabled}
                  onClick={() => {
                    if (activeVersionId) {
                      publishMutation.mutate(activeVersionId)
                    }
                  }}
                  data-testid="template-publish"
                >
                  {latestVersion
                    ? `Publish v${latestVersion.version_no}`
                    : "Publish"}
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:gap-10">
        <div className="space-y-8">
          <section
            className={templatesSectionClass}
            aria-labelledby="template-details-heading"
          >
            <h2
              id="template-details-heading"
              className="text-base font-semibold tracking-tight text-fg"
            >
              Template details
            </h2>
            <FormField
              id="template-name"
              label="Template name"
              name="name"
              required
              error={form.formState.errors.name?.message}
              testIdPrefix="template"
              className={templatesFieldStackClass}
            >
              <input
                id="template-name"
                className={templatesFieldControlClass}
                placeholder="e.g. Engagement · November update"
                disabled={!canWrite || mode === "edit"}
                {...form.register("name")}
              />
            </FormField>
            <div className="grid gap-7 sm:grid-cols-2 sm:gap-6">
              <FormField
                id="template-email-type"
                label="Email type"
                name="email_type"
                required
                error={form.formState.errors.email_type?.message}
                testIdPrefix="template"
                className={templatesFieldStackClass}
              >
                <Select
                  value={watchedType || undefined}
                  disabled={!canWrite || mode === "edit"}
                  onValueChange={(next) => {
                    if (next == null) {
                      return
                    }
                    form.setValue("email_type", next, {
                      shouldDirty: true,
                      shouldValidate: true,
                      shouldTouch: true,
                    })
                  }}
                >
                  <SelectTrigger
                    id="template-email-type"
                    size="default"
                    aria-invalid={Boolean(form.formState.errors.email_type)}
                    data-testid="template-email-type"
                    className={templatesSelectTriggerClass}
                  >
                    <SelectValue placeholder="Select email type" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    side="bottom"
                    sideOffset={8}
                    alignItemWithTrigger
                    className={templatesSelectContentClass}
                  >
                    {EMAIL_TYPE_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className={templatesSelectItemClass}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                id="template-preference-category"
                label="Preference category"
                name="preference_category"
                description="Filled from the email type."
                testIdPrefix="template"
                className={templatesFieldStackClass}
              >
                <input
                  id="template-preference-category"
                  className={templatesFieldControlClass}
                  value={preferenceCategoryLabel(
                    emailTypeValue,
                    selectedCategory?.name ?? template?.category_name
                  )}
                  readOnly
                  disabled
                />
              </FormField>
            </div>
          </section>

          <section
            className={templatesSectionClass}
            aria-labelledby="template-content-heading"
          >
            <h2
              id="template-content-heading"
              className="text-base font-semibold tracking-tight text-fg"
            >
              Content
            </h2>
            <FormField
              id="template-subject"
              label="Subject"
              name="subject"
              required
              error={form.formState.errors.subject?.message}
              testIdPrefix="template"
              className={templatesFieldStackClass}
            >
              <input
                id="template-subject"
                className={templatesFieldControlClass}
                disabled={!canWrite}
                {...form.register("subject")}
              />
            </FormField>
            <FormField
              id="template-body-source"
              label="HTML source"
              name="body_source"
              required
              error={form.formState.errors.body_source?.message}
              description="Use supported merge tags to personalize the message."
              testIdPrefix="template"
              className={templatesFieldStackClass}
            >
              <textarea
                id="template-body-source"
                rows={18}
                className={templatesTextareaClass}
                disabled={!canWrite}
                {...form.register("body_source")}
              />
            </FormField>
          </section>

          <section
            className={templatesSectionClass}
            aria-labelledby="template-merge-heading"
          >
            <div className="space-y-2">
              <h2
                id="template-merge-heading"
                className="text-base font-semibold tracking-tight text-fg"
              >
                Merge tags
              </h2>
              <p className="text-sm text-fg-muted">
                Tags found in the subject and HTML source.
              </p>
            </div>
            <ul className="flex flex-wrap gap-2.5">
              {mergeChips.length === 0 ? (
                <li className="text-sm text-fg-muted">
                  Tags used in the subject or HTML appear here.
                </li>
              ) : (
                mergeChips.map((chip) => (
                  <li key={chip.name}>
                    <span
                      className={cn(
                        "inline-flex rounded-md border px-2.5 py-1 font-mono text-[12px]",
                        chip.tone === "unsupported"
                          ? "border-err/30 bg-err/10 text-err"
                          : chip.tone === "required"
                            ? "border-ok/30 bg-ok/10 text-ok"
                            : chip.tone === "available"
                              ? "border-ok/30 bg-ok/10 text-ok"
                              : "border-border bg-surface-2 text-fg-muted"
                      )}
                      title={chip.hint}
                    >
                      {`{{${chip.name}}}`}
                      {chip.tone === "unsupported" ? " · Not sent" : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
            {complianceNote ? (
              <p className="text-sm leading-relaxed text-fg-muted">
                {complianceNote}
              </p>
            ) : null}
            {blockMessage ? (
              <p
                className="rounded-lg border border-err/30 bg-err/10 px-4 py-3 text-sm leading-relaxed text-err"
                role="alert"
                data-testid="template-publish-block"
              >
                {blockMessage}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-8">
          <TemplatePreviewFrame
            html={displayPreviewHtml}
            isLoading={previewMutation.isPending && !displayPreviewHtml}
          />

          <section
            className="rounded-xl border border-border bg-surface p-6 sm:p-7"
            aria-labelledby="template-checklist-heading"
          >
            <h2
              id="template-checklist-heading"
              className="text-base font-semibold tracking-tight text-fg"
            >
              Before publishing
            </h2>
            <ul className="mt-5 space-y-3.5">
              {checklist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 text-sm leading-relaxed text-fg"
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px]",
                      item.done
                        ? "border-ok bg-ok text-bg"
                        : "border-border text-transparent"
                    )}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className={item.done ? "text-fg" : "text-fg-muted"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <TemplateVersionsPanel
            template={template as TemplateDetail | null}
            selectedVersionId={activeVersionId}
            canWrite={canWrite}
            publishingId={
              publishMutation.isPending
                ? (publishMutation.variables ?? null)
                : null
            }
            onSelect={(versionId) => {
              setSelectedVersionId(versionId)
            }}
            onPublish={(versionId) => publishMutation.mutate(versionId)}
          />
        </aside>
      </div>
    </div>
  )
}
