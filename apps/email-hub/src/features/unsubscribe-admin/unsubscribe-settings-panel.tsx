"use client"

import { useState } from "react"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { StatusBadge } from "@/components/app/status-badge"
import type { UnsubscribeSettings } from "@/features/unsubscribe-admin/api"
import {
  usePatchUnsubscribeSettings,
  useUnsubscribeSettings,
  useVerifyUnsubscribeDomain,
} from "@/features/unsubscribe-admin/use-unsubscribe-settings"
import { isApiError } from "@/lib/api-client"
import { cn } from "@workspace/ui/lib/utils"

function domainStatusBadge(
  status: "unset" | "pending" | "verified" | "failed"
) {
  switch (status) {
    case "verified":
      return <StatusBadge variant="ok">Verified</StatusBadge>
    case "pending":
      return <StatusBadge variant="warn">Pending</StatusBadge>
    case "failed":
      return <StatusBadge variant="err">Failed</StatusBadge>
    default:
      return <StatusBadge variant="neutral">Unset</StatusBadge>
  }
}

export function UnsubscribeSettingsPanel() {
  const settings = useUnsubscribeSettings()

  if (settings.isError) {
    return (
      <InlineErrorCard
        message={
          isApiError(settings.error)
            ? settings.error.message
            : "Could not load unsubscribe settings."
        }
        requestId={isApiError(settings.error) ? settings.error.requestId : null}
        onRetry={() => {
          void settings.refetch()
        }}
      />
    )
  }

  if (settings.isPending || !settings.data) {
    return (
      <div
        className="h-40 animate-pulse rounded-md bg-surface-2"
        data-testid="unsubscribe-settings-loading"
        aria-hidden
      />
    )
  }

  return (
    <UnsubscribeSettingsForm
      key={`${settings.data.id}:${settings.data.updated_at}`}
      data={settings.data}
    />
  )
}

function UnsubscribeSettingsForm({ data }: { data: UnsubscribeSettings }) {
  const patch = usePatchUnsubscribeSettings()
  const verify = useVerifyUnsubscribeDomain()
  const [logoUrl, setLogoUrl] = useState(data.logo_url ?? "")
  const [customDomain, setCustomDomain] = useState(data.custom_domain ?? "")
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle")
  const actionError = patch.error ?? verify.error

  return (
    <div className="space-y-8" data-testid="unsubscribe-settings">
      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <header className="space-y-1">
          <h2 className="text-[15px] font-semibold text-fg">Logo</h2>
          <p className="text-sm text-fg-muted">
            HTTPS image URL shown on the public unsubscribe page. Leave blank to
            use the EmailHub mark.
          </p>
        </header>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1.5 text-sm">
            <span className="text-fg-muted">Logo URL</span>
            <input
              type="url"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://cdn.example.com/logo.png"
              className={inputClass()}
              data-testid="unsubscribe-logo-url"
            />
          </label>
          <button
            type="button"
            className={primaryButtonClass()}
            disabled={patch.isPending}
            data-testid="unsubscribe-logo-save"
            onClick={() => {
              const trimmed = logoUrl.trim()
              void patch.mutateAsync({
                logo_url: trimmed === "" ? null : trimmed,
              })
            }}
          >
            Save logo
          </button>
        </div>
        {data.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- settings preview
          <img
            src={data.logo_url}
            alt="Unsubscribe logo preview"
            className="h-10 w-auto max-w-[14rem] object-contain"
            data-testid="unsubscribe-logo-preview"
          />
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-[15px] font-semibold text-fg">Custom domain</h2>
            <p className="text-sm text-fg-muted">
              Point a CNAME at the Hub host and add the TXT token, then verify.
              Emails use this host only after verification.
            </p>
          </div>
          {domainStatusBadge(data.custom_domain_status)}
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1.5 text-sm">
            <span className="text-fg-muted">Hostname</span>
            <input
              type="text"
              value={customDomain}
              onChange={(event) => setCustomDomain(event.target.value)}
              placeholder="unsubscribe.example.com"
              className={inputClass()}
              data-testid="unsubscribe-custom-domain"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButtonClass()}
              disabled={patch.isPending}
              data-testid="unsubscribe-domain-save"
              onClick={() => {
                const trimmed = customDomain.trim()
                void patch.mutateAsync({
                  custom_domain: trimmed === "" ? null : trimmed,
                })
              }}
            >
              {customDomain.trim() === "" ? "Clear domain" : "Bind domain"}
            </button>
            <button
              type="button"
              className={outlineButtonClass()}
              disabled={
                verify.isPending ||
                !data.custom_domain ||
                data.custom_domain_status === "unset"
              }
              data-testid="unsubscribe-domain-verify"
              onClick={() => {
                void verify.mutateAsync()
              }}
            >
              Verify DNS
            </button>
          </div>
        </div>

        <p className="text-sm text-fg-muted">
          Hub host target:{" "}
          <span className="font-mono text-fg">{data.hub_host || "—"}</span>
        </p>

        {data.dns_records.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-border bg-surface-2 text-[11px] tracking-[0.08em] text-fg-muted uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Host</th>
                  <th className="px-3 py-2 font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.dns_records.map((record) => (
                  <tr
                    key={`${record.type}-${record.host}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono text-[13px]">
                      {record.type}
                    </td>
                    <td className="px-3 py-2 font-mono text-[13px]">
                      {record.host}
                    </td>
                    <td className="px-3 py-2 font-mono text-[13px] break-all">
                      {record.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted">Public base URL</span>
          <code
            className="rounded bg-surface-2 px-2 py-1 font-mono text-[13px] text-fg"
            data-testid="unsubscribe-public-base-url"
          >
            {data.public_base_url}
          </code>
          <button
            type="button"
            className={outlineButtonClass()}
            data-testid="unsubscribe-copy-public-url"
            onClick={async () => {
              await navigator.clipboard.writeText(data.public_base_url)
              setCopyState("copied")
              window.setTimeout(() => setCopyState("idle"), 1500)
            }}
          >
            {copyState === "copied" ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      {actionError ? (
        <InlineErrorCard
          message={
            isApiError(actionError)
              ? actionError.message
              : "Could not update settings."
          }
          requestId={isApiError(actionError) ? actionError.requestId : null}
        />
      ) : null}
    </div>
  )
}

function inputClass(): string {
  return cn(
    "h-10 w-full rounded-md border border-border bg-bg px-3 text-[13px] text-fg outline-none",
    "focus-visible:shadow-[0_0_0_3px_var(--ring)]"
  )
}

function primaryButtonClass(): string {
  return "inline-flex h-10 items-center justify-center rounded-md border border-fg bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-fg/90 disabled:pointer-events-none disabled:opacity-40"
}

function outlineButtonClass(): string {
  return "inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-[13px] font-medium text-fg transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
}
