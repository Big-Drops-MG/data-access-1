"use client"

import { useActionState, useState } from "react"

import { JOB_TITLES, type JobTitle } from "@workspace/shared"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import {
  completeOnboardingAction,
  type CompleteOnboardingState,
} from "@/lib/onboarding/complete-onboarding"

import { AuthCard } from "./auth-card"

const initialState: CompleteOnboardingState = { error: null }

/** First-login job title picker (display role for the top bar). */
export function OnboardingView() {
  const [selected, setSelected] = useState<JobTitle | null>(null)
  const [state, formAction, pending] = useActionState(
    completeOnboardingAction,
    initialState
  )

  return (
    <AuthCard
      title="Choose your role"
      description="This appears under your name in EmailHub. You can pick one now."
      className="max-w-[30rem]"
    >
      <form action={formAction} className="flex flex-col gap-6">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Role</legend>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {JOB_TITLES.map((title) => {
              const isSelected = selected === title
              return (
                <li key={title}>
                  <label
                    className={cn(
                      "relative flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors outline-none",
                      isSelected
                        ? "border-accent bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] shadow-[inset_0_0_0_1px_var(--accent)]"
                        : "border-border bg-surface hover:border-border-strong hover:bg-surface-2"
                    )}
                  >
                    <input
                      type="radio"
                      name="jobTitle"
                      value={title}
                      required
                      checked={isSelected}
                      onChange={() => setSelected(title)}
                      className="peer sr-only"
                      data-testid={`onboarding-role-${title}`}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-accent bg-accent"
                          : "border-border-strong bg-surface"
                      )}
                    >
                      <span
                        className={cn(
                          "size-2 rounded-full bg-on-primary transition-opacity",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        "text-sm transition-colors",
                        isSelected
                          ? "font-semibold text-fg"
                          : "font-medium text-fg-muted"
                      )}
                    >
                      {title}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>

        {state.error ? (
          <p
            className="text-sm text-err"
            role="alert"
            data-testid="onboarding-error"
          >
            {state.error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="h-11 w-full"
          disabled={pending || !selected}
          data-testid="onboarding-continue"
        >
          {pending ? "Saving…" : "Continue"}
        </Button>
      </form>
    </AuthCard>
  )
}
