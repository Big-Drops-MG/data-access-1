"use client"

import type { ReactNode } from "react"

import { EtDateTime } from "@/components/app/et-datetime"
import type { AuditLogListItem } from "@/features/audit-log/api"
import {
  actionLabel,
  actorTypeLabel,
  objectTypeLabel,
} from "@/features/audit-log/labels"
import {
  auditEventSummary,
  auditPayloadEntries,
  changedAuditKeys,
  partitionAuditFields,
  payloadDisplayName,
  type AuditFieldEntry,
} from "@/features/audit-log/summary"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"

type AuditLogDetailDialogProps = {
  entry: AuditLogListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function MetaCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface px-3.5 py-3">
      <p className="text-caption font-medium tracking-wide text-fg-muted uppercase">
        {label}
      </p>
      <div className="mt-1.5 min-w-0 text-sm text-fg">{children}</div>
    </div>
  )
}

function FieldRows({
  entries,
  changedKeys,
  tone = "default",
}: {
  entries: AuditFieldEntry[]
  changedKeys?: Set<string>
  tone?: "default" | "before" | "after"
}) {
  if (entries.length === 0) {
    return <p className="px-1 py-2 text-sm text-fg-muted">No fields to show.</p>
  }

  return (
    <dl className="overflow-hidden rounded-xl border border-border bg-surface">
      {entries.map((entry) => {
        const changed = changedKeys?.has(entry.key) ?? false
        return (
          <div
            key={entry.key}
            className={cn(
              "grid grid-cols-1 gap-1 border-b border-border px-3.5 py-3 last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-4",
              changed && tone === "after" && "bg-ok/5",
              changed && tone === "before" && "bg-warn/5"
            )}
          >
            <dt className="text-[12px] font-medium text-fg-muted">
              {entry.label}
            </dt>
            <dd
              className={cn(
                "min-w-0 text-sm break-words text-fg",
                entry.technical && "font-mono text-[12px] text-fg-muted",
                changed && "font-medium"
              )}
              title={typeof entry.raw === "string" ? entry.raw : undefined}
            >
              {entry.value}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function SnapshotPanel({
  title,
  hint,
  value,
  changedKeys,
  tone,
}: {
  title: string
  hint: string
  value: unknown
  changedKeys?: Set<string>
  tone: "before" | "after"
}) {
  if (value == null) {
    return (
      <section className="space-y-2.5">
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          <p className="text-[12px] text-fg-muted">{hint}</p>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-surface-2/50 px-4 py-6 text-center text-sm text-fg-muted">
          No snapshot recorded
        </div>
      </section>
    )
  }

  const { primary, technical } = partitionAuditFields(
    auditPayloadEntries(value)
  )

  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <p className="text-[12px] text-fg-muted">{hint}</p>
      </div>
      <FieldRows entries={primary} changedKeys={changedKeys} tone={tone} />
      {technical.length > 0 ? (
        <details className="group rounded-xl border border-border bg-surface-2/40 open:bg-surface">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[12px] font-medium text-fg-muted marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              Technical ids
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted group-open:bg-surface">
                {technical.length}
              </span>
            </span>
          </summary>
          <div className="border-t border-border p-2">
            <FieldRows entries={technical} />
          </div>
        </details>
      ) : null}
    </section>
  )
}

export function AuditLogDetailDialog({
  entry,
  open,
  onOpenChange,
}: AuditLogDetailDialogProps) {
  const objectLabel = entry
    ? (payloadDisplayName(entry.after) ??
      payloadDisplayName(entry.before) ??
      null)
    : null
  const changedKeys = entry
    ? changedAuditKeys(entry.before, entry.after)
    : new Set<string>()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="flex max-h-[min(92vh,46rem)] max-w-[44rem] flex-col gap-0 overflow-hidden p-0 data-[size=default]:max-w-[44rem] sm:max-w-[44rem] data-[size=default]:sm:max-w-[44rem]"
        size="default"
        data-testid="audit-log-detail-dialog"
      >
        {entry ? (
          <>
            <div className="shrink-0 border-b border-border bg-surface px-6 pt-5 pb-4">
              <AlertDialogHeader className="place-items-start gap-1 text-left">
                <p className="text-caption font-medium tracking-wide text-fg-muted uppercase">
                  Audit event
                </p>
                <AlertDialogTitle className="text-xl leading-snug font-semibold tracking-tight text-fg">
                  {auditEventSummary(entry)}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm leading-relaxed text-fg-muted">
                  {actionLabel(entry.action)} by {entry.actor_name} ·{" "}
                  <EtDateTime
                    value={entry.created_at}
                    className="inline text-sm text-fg-muted"
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MetaCard label="Actor">
                  <p className="truncate font-medium">{entry.actor_name}</p>
                  <p className="mt-0.5 text-[12px] text-fg-muted">
                    {actorTypeLabel(entry.actor_type)}
                  </p>
                </MetaCard>
                <MetaCard label="Object">
                  <p className="truncate font-medium">
                    {objectTypeLabel(entry.object_type)}
                    {objectLabel ? ` · ${objectLabel}` : ""}
                  </p>
                  {entry.object_id ? (
                    <p
                      className="mt-0.5 truncate font-mono text-[11px] text-fg-muted"
                      title={entry.object_id}
                    >
                      {entry.object_id}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[12px] text-fg-muted">
                      No object id
                    </p>
                  )}
                </MetaCard>
                <MetaCard label="When (ET)">
                  <EtDateTime
                    value={entry.created_at}
                    className="text-sm text-fg"
                  />
                </MetaCard>
                <MetaCard label="Request">
                  {entry.request_id ? (
                    <p
                      className="truncate font-mono text-[12px]"
                      title={entry.request_id}
                    >
                      {entry.request_id}
                    </p>
                  ) : (
                    <p className="text-fg-muted">Not recorded</p>
                  )}
                </MetaCard>
              </div>

              <div
                className={cn(
                  "grid grid-cols-1 gap-5",
                  entry.before != null &&
                    entry.after != null &&
                    "lg:grid-cols-2"
                )}
              >
                <SnapshotPanel
                  title="Before"
                  hint="State prior to this change"
                  value={entry.before}
                  changedKeys={changedKeys}
                  tone="before"
                />
                <SnapshotPanel
                  title="After"
                  hint="State after this change"
                  value={entry.after}
                  changedKeys={changedKeys}
                  tone="after"
                />
              </div>
            </div>

            <AlertDialogFooter className="m-0 shrink-0 gap-2 rounded-none border-t border-border bg-surface-2 px-6 py-4 group-data-[size=default]/alert-dialog-content:flex sm:justify-end">
              <AlertDialogCancel
                className="m-0 h-9 border-border bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-2"
                data-testid="audit-log-detail-close"
              >
                Close
              </AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
