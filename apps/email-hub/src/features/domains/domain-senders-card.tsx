"use client"

import { useQuery } from "@tanstack/react-query"
import { Mail } from "lucide-react"
import Link from "next/link"

import {
  fetchDomainSenders,
  type DomainSenderItem,
} from "@/features/domains/api"
import {
  getMockDomainSenders,
  USE_MOCK_DOMAINS,
} from "@/features/domains/mock-domains"
import { listQueryOptions } from "@/lib/query-options"
import { cn } from "@workspace/ui/lib/utils"

/** Four compact rows (~3rem each). Soft scrollbar; no nested card chrome. */
const SENDER_LIST_VIEWPORT = cn(
  "h-48 overflow-y-auto overscroll-contain pr-1",
  "[scrollbar-width:thin]",
  "[scrollbar-color:var(--border)_transparent]",
  "[&::-webkit-scrollbar]:w-1.5",
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
  "[&::-webkit-scrollbar-track]:bg-transparent"
)

type DomainSendersCardProps = {
  domainId: string
  senderCount: number
  domainActive: boolean
}

function statusTone(status: DomainSenderItem["status"]) {
  switch (status) {
    case "active":
      return {
        label: "Active",
        className: "text-ok",
        dot: "bg-ok",
      }
    case "inactive":
      return {
        label: "Disabled",
        className: "text-fg-muted",
        dot: "bg-fg-muted",
      }
    case "pending_verification":
      return {
        label: "Pending",
        className: "text-warn",
        dot: "bg-warn",
      }
  }
}

function senderInitial(name: string) {
  const letter = name.trim().charAt(0)
  return letter ? letter.toUpperCase() : "?"
}

export function DomainSendersCard({
  domainId,
  senderCount,
  domainActive,
}: DomainSendersCardProps) {
  const senders = useQuery({
    ...listQueryOptions(
      "domain-senders",
      () =>
        USE_MOCK_DOMAINS
          ? getMockDomainSenders(domainId)
          : fetchDomainSenders(domainId),
      { domainId }
    ),
    enabled: senderCount > 0,
  })

  const rows = senders.data?.data ?? []

  return (
    <section
      className="rounded-lg border border-border bg-surface"
      aria-labelledby="domains-senders-heading"
      data-testid="domains-senders"
    >
      <header className="flex items-center justify-between gap-2 px-5 pt-5 pb-3">
        <h2
          id="domains-senders-heading"
          className="text-base font-semibold tracking-tight text-fg"
        >
          Senders
        </h2>
        {senderCount > 0 ? (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted tabular-nums">
            {senderCount}
          </span>
        ) : null}
      </header>

      {senderCount === 0 ? (
        <div className="px-5 pb-5">
          <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-2 px-4 py-6 text-center">
            <span className="flex size-9 items-center justify-center rounded-full bg-surface text-info">
              <Mail className="size-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-fg">No senders yet</p>
              <p className="text-xs leading-4 text-fg-muted">
                {domainActive
                  ? "Add a sender to start mailing from this domain."
                  : "You can add senders once the domain is active."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-2 pb-2">
          {senders.isPending ? (
            <div
              className={SENDER_LIST_VIEWPORT}
              aria-busy
              aria-label="Loading senders"
            >
              <ul className="space-y-1 px-1">
                {Array.from({ length: Math.min(senderCount, 4) }).map(
                  (_, index) => (
                    <li
                      key={index}
                      className="flex h-12 items-center gap-3 rounded-lg px-2"
                    >
                      <span className="size-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="block h-3 w-20 animate-pulse rounded bg-surface-2" />
                        <span className="block h-2.5 w-36 animate-pulse rounded bg-surface-2" />
                      </span>
                    </li>
                  )
                )}
              </ul>
            </div>
          ) : (
            <div className={SENDER_LIST_VIEWPORT}>
              <ul
                className="space-y-0.5 px-1"
                data-testid="domains-senders-list"
              >
                {rows.map((sender) => {
                  const tone = statusTone(sender.status)
                  return (
                    <li key={sender.id}>
                      <Link
                        href="/senders"
                        className="group flex h-12 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-surface-2"
                        data-testid={`domains-sender-${sender.id}`}
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-fg-muted transition-colors group-hover:bg-surface group-hover:text-fg"
                          aria-hidden
                        >
                          {senderInitial(sender.from_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium tracking-tight text-fg">
                            {sender.from_name}
                          </span>
                          <span className="block truncate text-[12px] text-fg-muted">
                            {sender.from_email}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium",
                            tone.className
                          )}
                        >
                          <span
                            className={cn("size-1.5 rounded-full", tone.dot)}
                            aria-hidden
                          />
                          {tone.label}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
