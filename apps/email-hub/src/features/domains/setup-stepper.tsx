import { Check } from "lucide-react"

import type { SetupStepView } from "@/features/domains/domain-setup-summary"
import { cn } from "@workspace/ui/lib/utils"

const STATE_LABELS: Record<SetupStepView["state"], string> = {
  done: "Done",
  in_progress: "In progress",
  pending: "Not started",
}

export function SetupStepper({ steps }: { steps: readonly SetupStepView[] }) {
  return (
    <ol className="divide-y divide-border" data-testid="domains-setup-steps">
      {steps.map((step, index) => (
        <li
          key={step.key}
          className="flex gap-3 py-3 first:pt-0 last:pb-0"
          data-state={step.state}
          data-testid={`domains-setup-step-${step.key}`}
        >
          <span
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
              step.state === "done" && "border-ok bg-ok text-surface",
              step.state === "in_progress" &&
                "border-warn bg-surface text-warn",
              step.state === "pending" &&
                "border-border bg-surface text-fg-muted"
            )}
          >
            {step.state === "done" ? (
              <Check className="size-3.5" strokeWidth={2.25} aria-hidden />
            ) : (
              index + 1
            )}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-[13px] leading-none font-medium tracking-tight text-fg">
              {step.title}
              <span className="sr-only"> ({STATE_LABELS[step.state]})</span>
            </p>
            <p className="text-[12px] leading-4 text-fg-muted">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
