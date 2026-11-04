"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useMutationDisabledProps } from "@/components/app/online-status"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import {
  checkDomainDns,
  deleteDomain,
  disableDomain,
  fetchDomainDetail,
  type DomainDetailResponse,
} from "@/features/domains/api"
import { CopyButton } from "@/features/domains/copy-button"
import { DnsRecordStatusBadge } from "@/features/domains/dns-status"
import { DomainSendersCard } from "@/features/domains/domain-senders-card"
import { domainStatusToBadge } from "@/features/domains/domain-status"
import {
  buildSetupStepViews,
  dnsPurposeLabel,
  shortDomainId,
} from "@/features/domains/domain-setup-summary"
import { SetupStepper } from "@/features/domains/setup-stepper"
import { isApiError, isConflictError } from "@/lib/api-client"
import { detailQueryOptions } from "@/lib/query-options"
import { detailQueryKey, listQueryKey } from "@/lib/query-keys"
import { cn } from "@workspace/ui/lib/utils"

type DomainDetailPageProps = {
  /** UUID or FQDN from the route (`/domains/dev.quotifii.com`). */
  domainRef: string
  /** Admin-only actions (check now, disable). */
  canManage?: boolean
}

const detailOutlineBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-fg transition-colors outline-none hover:bg-surface-2 focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"

const detailDangerBtn =
  "inline-flex h-9 w-full items-center justify-center rounded-lg bg-err px-3.5 text-sm font-medium text-surface transition-colors outline-none hover:bg-err/90 focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-50"

function DnsTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide text-fg-muted uppercase">
      {type}
    </span>
  )
}

export function DomainDetailPage({
  domainRef,
  canManage = false,
}: DomainDetailPageProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const detail = useQuery(
    detailQueryOptions("domains", domainRef, () => fetchDomainDetail(domainRef))
  )

  const check = useMutation({
    mutationFn: () => checkDomainDns(domainRef),
    meta: { skipConflictDialog: true },
    onSuccess: async (updated) => {
      queryClient.setQueryData(detailQueryKey("domains", domainRef), updated)
      await queryClient.invalidateQueries({ queryKey: listQueryKey("domains") })
      toast.success("DNS records checked")
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not check DNS records"
      )
    },
  })

  const disable = useMutation({
    mutationFn: () => disableDomain(domainRef),
    meta: { skipConflictDialog: true },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: detailQueryKey("domains", domainRef),
        }),
        queryClient.invalidateQueries({ queryKey: listQueryKey("domains") }),
      ])
      toast.success("Domain disabled")
    },
    onError: (error) => {
      toast.error(
        isConflictError(error)
          ? "Deactivate this domain's senders and routes before disabling it."
          : isApiError(error)
            ? error.message
            : "Could not disable domain"
      )
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteDomain(domainRef),
    meta: { skipConflictDialog: true },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey("domains") })
      queryClient.removeQueries({
        queryKey: detailQueryKey("domains", domainRef),
      })
      if (result.ses_deleted && result.cloudflare_deleted) {
        toast.success("Domain deleted")
      } else if (!result.ses_deleted && !result.cloudflare_deleted) {
        toast.warning(
          "Domain removed from Email Hub, but SES and Cloudflare cleanup failed. Remove the SES identity and DNS records manually if needed."
        )
      } else if (!result.ses_deleted) {
        toast.warning(
          "Domain and Cloudflare DNS removed, but Amazon SES denied DeleteEmailIdentity. Apply ses:DeleteEmailIdentity and remove the identity in AWS if needed."
        )
      } else {
        toast.warning(
          "Domain removed from Email Hub and SES, but Cloudflare DNS cleanup failed. Set CLOUDFLARE_API_TOKEN and remove leftover records if needed."
        )
      }
      router.push("/domains")
    },
    onError: (error) => {
      const detailMessage =
        isApiError(error) && error.details[0]?.message
          ? error.details[0].message
          : null
      toast.error(
        isConflictError(error)
          ? "Remove all senders on this domain before deleting it."
          : detailMessage ||
              (isApiError(error) ? error.message : "Could not delete domain")
      )
    },
  })

  if (detail.isPending) {
    return (
      <div
        className="h-40 animate-pulse rounded-lg bg-surface-2"
        data-testid="domains-detail-loading"
        aria-hidden
      />
    )
  }

  if (detail.isError) {
    return (
      <InlineErrorCard
        message={
          isApiError(detail.error)
            ? detail.error.message
            : "Could not load domain."
        }
        requestId={isApiError(detail.error) ? detail.error.requestId : null}
        onRetry={() => {
          void detail.refetch()
        }}
      />
    )
  }

  const domain: DomainDetailResponse = detail.data
  const badgeStatus = domainStatusToBadge(domain.status)
  const isDisabled = domain.status === "inactive"
  const actionsDisabled = mutationDisabled.disabled

  const steps = buildSetupStepViews({
    status: domain.status,
    setupSteps: domain.setup_steps,
    dnsRecords: domain.dns_records,
  })

  return (
    <div className="space-y-6" data-testid="domains-detail">
      <PageHeader
        title={domain.name}
        titleBadge={
          badgeStatus ? (
            <StatusBadge status={badgeStatus} />
          ) : (
            <StatusBadge variant="neutral">{domain.status}</StatusBadge>
          )
        }
        meta={
          <>
            <span className="font-mono text-caption">
              {shortDomainId(domain.id)}
            </span>
            {domain.ses_region ? ` · ${domain.ses_region}` : null}
            {" · added "}
            <EtDateTime
              value={domain.created_at}
              className="text-sm text-fg-muted"
            />
          </>
        }
        breadcrumbs={[
          { label: "Domains", href: "/domains" },
          { label: domain.name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-fg-muted">
              Last checked{" "}
              <EtDateTime
                value={domain.last_checked_at}
                fallback="never"
                className="text-sm text-fg-muted"
              />
            </p>
            {canManage ? (
              <button
                type="button"
                disabled={check.isPending || actionsDisabled}
                title={mutationDisabled.title}
                onClick={() => check.mutate()}
                data-testid="domains-check-now"
                className={detailOutlineBtn}
              >
                <RefreshCw
                  className={cn("size-4", check.isPending && "animate-spin")}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {check.isPending ? "Checking…" : "Check now"}
              </button>
            ) : null}
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(14rem,1fr)]">
        <section
          className="overflow-hidden rounded-lg border border-border bg-surface"
          aria-labelledby="domains-dns-heading"
          data-testid="domains-dns-records"
        >
          <header className="space-y-1 border-b border-border px-5 py-4">
            <h2
              id="domains-dns-heading"
              className="text-base font-semibold text-fg"
            >
              DNS records
            </h2>
            <p className="text-sm text-fg-muted">
              Add these in Cloudflare (or rely on auto-sync when
              CLOUDFLARE_API_TOKEN is set). Re-check after publishing.
            </p>
          </header>

          {domain.dns_records.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">
              No DNS records for this domain.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] table-fixed border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="w-[8.5rem] px-4 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                      Purpose
                    </th>
                    <th className="w-[5.5rem] px-3 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                      Type
                    </th>
                    <th className="w-[32%] px-3 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                      Name
                    </th>
                    <th className="w-[34%] px-3 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                      Value
                    </th>
                    <th className="w-[8.5rem] px-4 py-2.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {domain.dns_records.map((record) => {
                    const purpose = dnsPurposeLabel(
                      record,
                      domain.name,
                      domain.dns_records
                    )
                    return (
                      <tr
                        key={record.id}
                        className="border-b border-border last:border-b-0"
                        data-testid={`domains-dns-row-${record.id}`}
                      >
                        <td className="px-4 py-3 align-middle text-sm font-medium text-fg">
                          {purpose}
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <DnsTypeBadge type={record.record_type} />
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex min-w-0 items-center gap-1">
                            <code
                              className="min-w-0 flex-1 truncate font-mono text-xs text-fg"
                              title={record.name}
                            >
                              {record.name}
                            </code>
                            <CopyButton
                              label={`${purpose} name`}
                              value={record.name}
                              testId={`domains-copy-name-${record.id}`}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex min-w-0 items-center gap-1">
                            <code
                              className="min-w-0 flex-1 truncate font-mono text-xs text-fg"
                              title={record.expected_value}
                            >
                              {record.expected_value}
                            </code>
                            <CopyButton
                              label={`${purpose} value`}
                              value={record.expected_value}
                              testId={`domains-copy-value-${record.id}`}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <DnsRecordStatusBadge status={record.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section
            className="space-y-4 rounded-lg border border-border bg-surface p-5"
            aria-labelledby="domains-steps-heading"
          >
            <h2
              id="domains-steps-heading"
              className="text-base font-semibold text-fg"
            >
              What happens next
            </h2>
            <SetupStepper steps={steps} />
          </section>

          <DomainSendersCard
            domainId={domain.id}
            senderCount={domain.sender_count}
            domainActive={domain.status === "verified"}
          />

          {canManage ? (
            <>
              <section
                className="space-y-3 rounded-lg border border-border bg-surface p-5"
                aria-labelledby="domains-disable-heading"
                data-testid="domains-disable"
              >
                <h2
                  id="domains-disable-heading"
                  className="text-base font-semibold text-fg"
                >
                  Disable domain
                </h2>
                <p className="text-sm leading-5 text-fg-muted">
                  {isDisabled
                    ? "This domain is disabled and cannot be used for new senders."
                    : "Senders on this domain stop working. Blocked while scheduled sends use it."}
                </p>
                {isDisabled ? null : (
                  <ConfirmDialog
                    title="Disable domain"
                    description={`Disabling ${domain.name} stops all sending from it.`}
                    confirmLabel="Disable domain"
                    confirmPhrase={domain.name}
                    destructive
                    onConfirm={() => disable.mutate()}
                    trigger={
                      <button
                        type="button"
                        disabled={
                          disable.isPending ||
                          remove.isPending ||
                          actionsDisabled
                        }
                        title={mutationDisabled.title}
                        data-testid="domains-disable-trigger"
                        className={detailDangerBtn}
                      >
                        Disable domain
                      </button>
                    }
                  />
                )}
              </section>

              <section
                className="space-y-3 rounded-lg border border-border bg-surface p-5"
                aria-labelledby="domains-delete-heading"
                data-testid="domains-delete"
              >
                <h2
                  id="domains-delete-heading"
                  className="text-base font-semibold text-fg"
                >
                  Delete domain
                </h2>
                <p className="text-sm leading-5 text-fg-muted">
                  Permanently removes this domain from Email Hub and Amazon SES.
                  DNS records in your DNS provider are not changed. Remove all
                  senders first.
                </p>
                <ConfirmDialog
                  title="Delete domain"
                  description={`This deletes ${domain.name} from Email Hub and Amazon SES. This cannot be undone.`}
                  confirmLabel="Delete domain"
                  confirmPhrase={domain.name}
                  destructive
                  onConfirm={() => remove.mutate()}
                  trigger={
                    <button
                      type="button"
                      disabled={
                        remove.isPending || disable.isPending || actionsDisabled
                      }
                      title={mutationDisabled.title}
                      data-testid="domains-delete-trigger"
                      className={detailDangerBtn}
                    >
                      Delete domain
                    </button>
                  }
                />
              </section>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
