"use client"

import { EtDateTime } from "@/components/app/et-datetime"
import type { TemplateDetail } from "@/features/templates/api"
import { templatesOutlineControl } from "@/features/templates/templates-ui"
import { cn } from "@workspace/ui/lib/utils"

type TemplateVersionsPanelProps = {
  template: TemplateDetail | null
  selectedVersionId: string | null
  canWrite: boolean
  publishingId: string | null
  onSelect: (versionId: string) => void
  onPublish: (versionId: string) => void
  className?: string
}

export function TemplateVersionsPanel({
  template,
  selectedVersionId,
  canWrite,
  publishingId,
  onSelect,
  onPublish,
  className,
}: TemplateVersionsPanelProps) {
  const versions = template?.versions ?? []
  const currentId = template?.current_version_id ?? null

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-surface p-6 sm:p-7",
        className
      )}
      aria-labelledby="template-versions-heading"
      data-testid="template-versions"
    >
      <h2
        id="template-versions-heading"
        className="text-base font-semibold tracking-tight text-fg"
      >
        Versions
      </h2>

      {versions.length === 0 ? (
        <p
          className="mt-5 text-sm leading-relaxed text-fg-muted"
          data-testid="template-versions-empty"
        >
          No versions yet. Creating a draft saves v1. Later saves create new
          versions. Template ID, author, and time are recorded automatically.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {versions.map((version) => {
            const isCurrent = version.id === currentId
            const isSelected = version.id === selectedVersionId
            const isDraft = !isCurrent
            return (
              <li key={version.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(version.id)}
                    className={cn(
                      "min-w-0 text-left outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]",
                      isSelected ? "text-fg" : "text-fg-muted hover:text-fg"
                    )}
                    data-testid={`template-version-${version.version_no}`}
                  >
                    <span className="block text-sm font-medium text-fg">
                      v{version.version_no}
                      {isCurrent ? " · published" : isDraft ? " · draft" : ""}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-fg-muted">
                      <EtDateTime value={version.created_at} />
                    </span>
                  </button>
                  {canWrite && !isCurrent ? (
                    <button
                      type="button"
                      className={templatesOutlineControl("px-2.5 py-1.5")}
                      disabled={publishingId === version.id}
                      onClick={() => onPublish(version.id)}
                      data-testid={`template-rollback-${version.version_no}`}
                    >
                      {currentId ? "Roll back" : "Publish"}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
