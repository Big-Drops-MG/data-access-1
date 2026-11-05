"use client"

import { useMemo, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

type PreviewViewport = "desktop" | "mobile"

type TemplatePreviewFrameProps = {
  html: string | null
  isLoading?: boolean
  className?: string
}

/**
 * Sandboxed iframe preview: no allow-scripts, no allow-same-origin (SD#14.5).
 * srcDoc only — the document cannot reach parent origin or run scripts.
 */
export function TemplatePreviewFrame({
  html,
  isLoading = false,
  className,
}: TemplatePreviewFrameProps) {
  const [viewport, setViewport] = useState<PreviewViewport>("desktop")

  const srcDoc = useMemo(() => {
    if (!html) {
      return null
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank" rel="noopener noreferrer"><style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#fff;color:#111;}</style></head><body>${html}</body></html>`
  }, [html])

  return (
    <section
      className={cn(
        "flex min-h-[30rem] flex-col overflow-hidden rounded-xl border border-border bg-surface",
        className
      )}
      aria-label="Email preview"
      data-testid="template-preview"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <p className="text-sm font-semibold tracking-tight text-fg">
          Sandboxed preview
        </p>
        <div
          className="inline-flex rounded-full border border-border p-0.5"
          role="group"
          aria-label="Preview viewport"
        >
          {(["desktop", "mobile"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setViewport(option)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-medium capitalize transition-colors",
                viewport === option
                  ? "bg-fg text-bg"
                  : "text-fg-muted hover:text-fg"
              )}
              data-testid={`template-preview-${option}`}
            >
              {option}
            </button>
          ))}
        </div>
      </header>
      <div className="flex flex-1 justify-center bg-surface-2 p-5">
        {isLoading ? (
          <div
            className="h-48 w-full max-w-xl animate-pulse rounded-lg bg-surface"
            aria-hidden
          />
        ) : srcDoc ? (
          <iframe
            key={srcDoc.slice(0, 64)}
            title="Email preview"
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={srcDoc}
            className={cn(
              "h-[34rem] border-0 bg-white shadow-sm",
              viewport === "mobile" ? "w-[375px]" : "w-full max-w-3xl"
            )}
            data-testid="template-preview-frame"
          />
        ) : (
          <p
            className="self-center px-4 text-center text-sm leading-relaxed text-fg-muted"
            data-testid="template-preview-empty"
          >
            Your email preview will appear here.
          </p>
        )}
      </div>
    </section>
  )
}
