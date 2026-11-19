"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Upload } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import {
  importRecipientsCsv,
  type RecipientImportLatest,
} from "@/features/recipients/api"
import { RecipientsTabs } from "@/features/recipients/recipients-tabs"
import { recipientsOutlineControl } from "@/features/recipients/recipients-ui"
import { useLatestRecipientImport } from "@/features/recipients/use-latest-recipient-import"
import { isApiError } from "@/lib/api-client"
import { detailQueryKey } from "@/lib/query-keys"
import { cn } from "@workspace/ui/lib/utils"

type RecipientsImportPageProps = {
  canImport?: boolean
}

type ActiveUpload = {
  uploadId: string
  fileName: string
  fileSize: number
}

const numberFmt = new Intl.NumberFormat("en-US")

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <p className="text-caption font-medium tracking-wide text-fg-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular-nums">
        {numberFmt.format(value)}
      </p>
    </div>
  )
}

export function RecipientsImportPage({
  canImport = false,
}: RecipientsImportPageProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [activeUpload, setActiveUpload] = useState<ActiveUpload | null>(null)

  const latestQuery = useLatestRecipientImport({
    refetchInterval: activeUpload ? 2000 : false,
  })
  const latest = latestQuery.data?.data ?? null

  useEffect(() => {
    if (!activeUpload || !latest) {
      return
    }
    if (latest.upload_id !== activeUpload.uploadId) {
      return
    }
    const uploadId = activeUpload.uploadId
    const timer = window.setTimeout(() => {
      setActiveUpload((current) =>
        current?.uploadId === uploadId ? null : current
      )
      toast.success("Import finished")
    }, 0)
    return () => window.clearTimeout(timer)
  }, [activeUpload, latest])

  const importMutation = useMutation({
    mutationFn: (file: File) => importRecipientsCsv(file),
    onSuccess: async (result, file) => {
      setActiveUpload({
        uploadId: result.upload_id,
        fileName: file.name,
        fileSize: file.size,
      })
      toast.success("CSV queued for import")
      await queryClient.invalidateQueries({
        queryKey: detailQueryKey("recipients-import", "latest"),
      })
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not upload recipients CSV"
      )
    },
  })

  const processing = Boolean(activeUpload) || importMutation.isPending
  const progressLabel = useMemo(() => {
    if (importMutation.isPending) {
      return "Uploading…"
    }
    if (activeUpload) {
      return "Processing…"
    }
    return null
  }, [activeUpload, importMutation.isPending])

  function takeFile(file: File | undefined | null) {
    if (!file || !canImport || importMutation.isPending || activeUpload) {
      return
    }
    importMutation.mutate(file)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipients"
        description="Everyone Email Hub has emailed or imported. Tier comes from Arohaa."
      />
      <RecipientsTabs active="import" />

      {!canImport ? (
        <InlineErrorCard message="Operator access is required to import recipients." />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">Upload CSV</h2>
          <div
            className={cn(
              "mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
              dragOver
                ? "border-info bg-info/5"
                : "border-border bg-surface-2/40"
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragOver(false)
              takeFile(event.dataTransfer.files?.[0])
            }}
            data-testid="recipients-import-dropzone"
          >
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-info/10 text-info">
              <Upload className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="mt-4 text-sm font-semibold text-fg">
              Drop a CSV file here
            </p>
            <p className="mt-1 max-w-sm text-[13px] text-fg-muted">
              CSV only (export from Excel if needed). Required: email. Optional:
              first_name, offer_id, external_user_id. Up to 50 MB. Unknown
              columns and invalid rows are rejected.
            </p>
            <button
              type="button"
              className={cn(recipientsOutlineControl, "mt-5")}
              disabled={!canImport || processing}
              onClick={() => inputRef.current?.click()}
              data-testid="recipients-import-choose"
            >
              Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              data-testid="recipients-import-input"
              onChange={(event) => {
                takeFile(event.target.files?.[0])
                event.target.value = ""
              }}
            />
          </div>

          {activeUpload || importMutation.isPending ? (
            <div
              className="mt-4 space-y-2"
              data-testid="recipients-import-status"
            >
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <p className="min-w-0 truncate font-medium text-fg">
                  {activeUpload
                    ? `${activeUpload.fileName} · ${formatBytes(activeUpload.fileSize)}`
                    : "Uploading CSV…"}
                </p>
                <p className="shrink-0 text-fg-muted">{progressLabel}</p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn(
                    "h-full rounded-full bg-accent",
                    importMutation.isPending
                      ? "w-2/5 animate-pulse"
                      : "w-4/5 animate-pulse"
                  )}
                />
              </div>
            </div>
          ) : null}

          {importMutation.isError ? (
            <div className="mt-4" data-testid="recipients-import-error">
              <InlineErrorCard
                title="Upload rejected"
                message={
                  isApiError(importMutation.error)
                    ? [
                        importMutation.error.message,
                        ...importMutation.error.details.map(
                          (detail) => detail.message
                        ),
                      ]
                        .filter(Boolean)
                        .filter(
                          (value, index, all) => all.indexOf(value) === index
                        )
                        .join(" ")
                    : "Could not upload recipients CSV"
                }
                requestId={
                  isApiError(importMutation.error)
                    ? importMutation.error.requestId
                    : null
                }
              />
            </div>
          ) : null}
        </section>

        <div className="space-y-4">
          <LastImportSummary latest={latest} loading={latestQuery.isPending} />
          <InvalidRowsTable latest={latest} />
        </div>
      </div>
    </div>
  )
}

function LastImportSummary({
  latest,
  loading,
}: {
  latest: RecipientImportLatest | null
  loading: boolean
}) {
  return (
    <section
      className="rounded-xl border border-border bg-surface p-5"
      data-testid="recipients-import-last-summary"
    >
      <h2 className="text-caption font-medium tracking-wide text-fg-muted uppercase">
        {latest ? (
          <>
            Last import ·{" "}
            <EtDateTime
              value={latest.completed_at}
              className="inline text-caption font-medium text-fg-muted uppercase"
            />
          </>
        ) : (
          "Last import"
        )}
      </h2>

      {loading && !latest ? (
        <p className="mt-4 text-sm text-fg-muted">Loading summary…</p>
      ) : !latest ? (
        <p className="mt-4 text-sm text-fg-muted">
          No imports yet. Upload a CSV to see added, updated, skipped, and
          invalid counts here.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryStat label="Added" value={latest.added} />
          <SummaryStat label="Updated" value={latest.updated} />
          <SummaryStat label="Skipped" value={latest.skipped} />
          <SummaryStat label="Invalid" value={latest.invalid} />
        </div>
      )}
    </section>
  )
}

function InvalidRowsTable({
  latest,
}: {
  latest: RecipientImportLatest | null
}) {
  const rows = latest?.invalid_rows ?? []

  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-surface"
      data-testid="recipients-import-invalid-rows"
    >
      <header className="border-b border-border px-5 py-3">
        <h2 className="text-caption font-medium tracking-wide text-fg-muted uppercase">
          Invalid rows
        </h2>
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-fg-muted">
          {latest && latest.invalid > 0
            ? `${numberFmt.format(latest.invalid)} invalid row${latest.invalid === 1 ? "" : "s"} — details were not stored for this import.`
            : "No invalid rows from the last import."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead className="bg-surface-2 text-caption font-medium tracking-wide text-fg-muted uppercase">
              <tr>
                <th className="px-5 py-2.5 font-medium">Row</th>
                <th className="px-5 py-2.5 font-medium">Column</th>
                <th className="px-5 py-2.5 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.row}-${row.column}-${row.problem}`}
                  className="border-t border-border"
                >
                  <td className="px-5 py-2.5 text-fg tabular-nums">
                    {numberFmt.format(row.row)}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[13px] text-fg">
                    {row.column}
                  </td>
                  <td className="px-5 py-2.5 text-fg-muted">{row.problem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
