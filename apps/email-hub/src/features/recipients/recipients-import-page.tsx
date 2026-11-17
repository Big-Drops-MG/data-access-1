"use client"

import { useMutation } from "@tanstack/react-query"
import { Upload } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { importRecipientsCsv } from "@/features/recipients/api"
import { RecipientsTabs } from "@/features/recipients/recipients-tabs"
import {
  recipientsOutlineControl,
  recipientsPrimaryControl,
} from "@/features/recipients/recipients-ui"
import { isApiError } from "@/lib/api-client"
import { cn } from "@workspace/ui/lib/utils"

type RecipientsImportPageProps = {
  canImport?: boolean
}

export function RecipientsImportPage({
  canImport = false,
}: RecipientsImportPageProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [lastUploadId, setLastUploadId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const importMutation = useMutation({
    mutationFn: (file: File) => importRecipientsCsv(file),
    onSuccess: (result, file) => {
      setFileName(file.name)
      setLastUploadId(result.upload_id)
      toast.success("CSV queued for import")
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not upload recipients CSV"
      )
    },
  })

  function takeFile(file: File | undefined | null) {
    if (!file || !canImport || importMutation.isPending) {
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">Upload CSV</h2>
          <div
            className={cn(
              "mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
              dragOver
                ? "border-fg bg-surface-2/70"
                : "border-border bg-surface-2/30"
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
            <Upload
              className="size-8 text-info"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="mt-3 text-sm font-medium text-fg">
              Drop a CSV file here
            </p>
            <p className="mt-1 max-w-sm text-[13px] text-fg-muted">
              Needs an email column. Optional: first_name, offer_id. Up to 50
              MB.
            </p>
            <button
              type="button"
              className={cn(recipientsPrimaryControl, "mt-5")}
              disabled={!canImport || importMutation.isPending}
              onClick={() => inputRef.current?.click()}
              data-testid="recipients-import-choose"
            >
              {importMutation.isPending ? "Uploading…" : "Choose file"}
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

          {fileName || lastUploadId ? (
            <div
              className="mt-4 rounded-xl border border-border bg-surface-2/40 px-4 py-3"
              data-testid="recipients-import-status"
            >
              <p className="text-sm font-medium text-fg">
                {fileName ?? "CSV upload"}
              </p>
              <p className="mt-1 text-[13px] text-fg-muted">
                {importMutation.isPending
                  ? "Uploading and queueing…"
                  : lastUploadId
                    ? `Queued · upload ${lastUploadId}`
                    : "Ready"}
              </p>
              {importMutation.isPending ? (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-2/5 animate-pulse rounded-full bg-fg" />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">How import works</h2>
          <ul className="mt-3 space-y-2 text-sm text-fg-muted">
            <li>Rows are ingested asynchronously after upload.</li>
            <li>Existing emails update; new emails are added.</li>
            <li>Suppressed addresses are skipped for engagement sends.</li>
            <li>Invalid rows are reported by the ingest worker logs.</li>
          </ul>
          <button
            type="button"
            className={cn(recipientsOutlineControl, "mt-5")}
            onClick={() => {
              setFileName(null)
              setLastUploadId(null)
            }}
            data-testid="recipients-import-reset"
          >
            Clear status
          </button>
        </section>
      </div>
    </div>
  )
}
