"use client"

import Link from "next/link"
import { useState } from "react"

import { EmptyState } from "@/components/app/empty-state"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import {
  useCanMutate,
  useMutationDisabledProps,
  useOnlineStatus,
} from "@/components/app/online-status"
import { PageHeader } from "@/components/app/page-header"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { loginRedirectPath } from "@/lib/auth-redirect"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { Inbox } from "lucide-react"

type PreviewState = "loading" | "error" | "empty" | "ready"

const DEMO_REQUEST_ID = "req_demo_12_8_abc"

export default function PageStatesDemoPage() {
  const [preview, setPreview] = useState<PreviewState>("ready")
  const [retryCount, setRetryCount] = useState(0)
  const { isOnline, setForcedOffline } = useOnlineStatus()
  const canMutate = useCanMutate()
  const mutationProps = useMutationDisabledProps()
  const loginPath = loginRedirectPath("/page-states")

  return (
    <div className="space-y-10">
      <PageHeader
        title="Page states"
        description="Demo for SD#12.8 — loading skeletons, inline errors with request id, 403/404, 401 login redirect, and offline mutations."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Page states" },
        ]}
      />

      <section className="space-y-3" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="text-h4 font-semibold text-fg">
          Content preview
        </h2>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Preview state"
        >
          {(
            [
              ["ready", "Ready"],
              ["loading", "Loading"],
              ["empty", "Empty"],
              ["error", "Error"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={preview === value ? "default" : "outline"}
              onClick={() => setPreview(value)}
              data-testid={`page-states-preview-${value}`}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="rounded-md border border-border bg-surface p-4">
          {preview === "loading" ? <PageSkeleton rows={4} /> : null}
          {preview === "empty" ? (
            <EmptyState
              title="No items yet"
              description="Create one to see it listed here."
              icon={<Inbox />}
              action={
                <Button type="button" data-testid="page-states-empty-action">
                  Create item
                </Button>
              }
            />
          ) : null}
          {preview === "error" ? (
            <InlineErrorCard
              requestId={DEMO_REQUEST_ID}
              onRetry={() => {
                setRetryCount((count) => count + 1)
                setPreview("loading")
                window.setTimeout(() => setPreview("ready"), 600)
              }}
            />
          ) : null}
          {preview === "ready" ? (
            <p
              className="text-body text-fg-muted"
              data-testid="page-states-ready"
            >
              Content loaded
              {retryCount > 0 ? ` (retried ${retryCount}×)` : null}.
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="http-heading">
        <h2 id="http-heading" className="text-h4 font-semibold text-fg">
          HTTP status pages
        </h2>
        <ul className="flex flex-wrap gap-3">
          <li>
            <Link
              href="/page-states/forbidden"
              className={buttonVariants({ variant: "outline" })}
              data-testid="page-states-link-403"
            >
              Open 403
            </Link>
          </li>
          <li>
            <Link
              href="/page-states/missing"
              className={buttonVariants({ variant: "outline" })}
              data-testid="page-states-link-404"
            >
              Open 404
            </Link>
          </li>
          <li>
            <Link
              href={loginPath}
              className={buttonVariants({ variant: "outline" })}
              data-testid="page-states-link-401"
            >
              Simulate 401 redirect
            </Link>
          </li>
        </ul>
        <p className="text-sm text-fg-muted">
          401 uses{" "}
          <code
            className="font-mono text-caption"
            data-testid="page-states-401-path"
          >
            {loginPath}
          </code>
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="offline-heading">
        <h2 id="offline-heading" className="text-h4 font-semibold text-fg">
          Offline banner and mutations
        </h2>
        <p className="text-sm text-fg-muted">
          Status:{" "}
          <span data-testid="page-states-online-label">
            {isOnline ? "online" : "offline"}
          </span>
          . Mutations{" "}
          <span data-testid="page-states-can-mutate">
            {canMutate ? "enabled" : "disabled"}
          </span>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setForcedOffline(true)}
            data-testid="page-states-force-offline"
          >
            Force offline
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setForcedOffline(false)}
            data-testid="page-states-force-online"
          >
            Force online
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setForcedOffline(null)}
            data-testid="page-states-clear-force"
          >
            Use browser status
          </Button>
        </div>
        <Button
          type="button"
          {...mutationProps}
          className={cn(!canMutate && "opacity-60")}
          data-testid="page-states-mutation"
          onClick={() => {
            if (!canMutate) {
              return
            }
            window.alert("Mutation ran")
          }}
        >
          Run mutation
        </Button>
      </section>
    </div>
  )
}
