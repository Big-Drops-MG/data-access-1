"use client"

import { useState, useTransition } from "react"

import type { ApplyUnsubscribeScope } from "@workspace/shared"
import { cn } from "@workspace/ui/lib/utils"

import { AuthCard } from "@/components/auth/auth-card"
import {
  unsubscribeConfirmCopy,
  unsubscribeDoneMessage,
  unsubscribeExpiredMessage,
} from "@/features/unsubscribe/unsubscribe-copy"

type UnsubscribeFormProps = {
  token: string
  categoryName: string | null
  logoUrl?: string | null
}

type ViewState = "confirm" | "done" | "error"

export function UnsubscribeForm({
  token,
  categoryName,
  logoUrl = null,
}: UnsubscribeFormProps) {
  const copy = unsubscribeConfirmCopy(categoryName)
  const [scope, setScope] = useState<ApplyUnsubscribeScope>("category")
  const [view, setView] = useState<ViewState>("confirm")
  const [appliedScope, setAppliedScope] =
    useState<ApplyUnsubscribeScope>("category")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function submit() {
    setErrorMessage(null)
    startTransition(async () => {
      try {
        const response = await fetch(`/api/u/${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(scope === "all" ? { scope: "all" } : {}),
        })
        if (response.status === 410) {
          setView("error")
          setErrorMessage(unsubscribeExpiredMessage())
          return
        }
        if (response.status === 404) {
          setView("error")
          setErrorMessage("This unsubscribe link is not valid.")
          return
        }
        if (response.status === 429) {
          setView("error")
          setErrorMessage("Too many requests. Please try again shortly.")
          return
        }
        if (!response.ok) {
          setView("error")
          setErrorMessage("Could not update preferences. Please try again.")
          return
        }
        setAppliedScope(scope)
        setView("done")
      } catch {
        setView("error")
        setErrorMessage("Could not update preferences. Please try again.")
      }
    })
  }

  if (view === "done") {
    return (
      <div data-testid="unsubscribe-done">
        <AuthCard
          title="You're unsubscribed"
          description={unsubscribeDoneMessage(appliedScope)}
          logoUrl={logoUrl}
        >
          <p
            className="text-center text-sm text-fg-muted"
            data-testid="unsubscribe-done-detail"
          >
            You can close this page.
          </p>
        </AuthCard>
      </div>
    )
  }

  if (view === "error") {
    return (
      <AuthCard
        title="Unsubscribe"
        description={errorMessage ?? "Something went wrong."}
        logoUrl={logoUrl}
      >
        <button
          type="button"
          className={primaryButtonClass()}
          data-testid="unsubscribe-retry"
          onClick={() => {
            setView("confirm")
            setErrorMessage(null)
          }}
        >
          Try again
        </button>
      </AuthCard>
    )
  }

  return (
    <div data-testid="unsubscribe-confirm">
      <AuthCard
        title="Unsubscribe"
        description="Choose what you want to stop receiving, then confirm."
        logoUrl={logoUrl}
      >
        <fieldset className="space-y-3" data-testid="unsubscribe-scope">
          <legend className="sr-only">Unsubscribe scope</legend>
          <ScopeOption
            id="unsubscribe-scope-category"
            name="scope"
            checked={scope === "category"}
            onChange={() => setScope("category")}
            title={`Only ${copy.categoryLabel}`}
            description={copy.categoryDescription}
          />
          <ScopeOption
            id="unsubscribe-scope-all"
            name="scope"
            checked={scope === "all"}
            onChange={() => setScope("all")}
            title="All relationship emails"
            description={copy.allDescription}
          />
        </fieldset>

        <button
          type="button"
          className={primaryButtonClass()}
          data-testid="unsubscribe-confirm-submit"
          disabled={pending}
          onClick={() => void submit()}
        >
          {pending ? "Saving..." : "Confirm unsubscribe"}
        </button>
      </AuthCard>
    </div>
  )
}

function ScopeOption({
  id,
  name,
  checked,
  onChange,
  title,
  description,
}: {
  id: string
  name: string
  checked: boolean
  onChange: () => void
  title: string
  description: string
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
        checked
          ? "border-fg bg-surface-2"
          : "border-border bg-surface hover:bg-surface-2"
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        <span className="mt-0.5 block text-sm text-fg-muted">
          {description}
        </span>
      </span>
    </label>
  )
}

function primaryButtonClass(): string {
  return "inline-flex h-10 w-full items-center justify-center rounded-md border border-fg bg-fg px-4 text-[13px] font-medium text-bg transition-colors hover:bg-fg/90 disabled:pointer-events-none disabled:opacity-40"
}
