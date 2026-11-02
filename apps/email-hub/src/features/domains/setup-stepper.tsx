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
    <ol className="space-y-4" data-testid="domains-setup-steps">
      {steps.map((step, index) => (
        <li
          key={step.key}
          className="flex gap-3"
          data-state={step.state}
          data-testid={`domains-setup-step-${step.key}`}
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-caption font-medium tabular-nums",
              step.state === "done" && "border-ok bg-ok text-surface",
              step.state === "in_progress" && "border-info text-info",
              step.state === "pending" && "border-border-strong text-fg-muted"
            )}
          >
            {step.state === "done" ? (
              <Check className="size-3.5" strokeWidth={2.25} aria-hidden />
            ) : (
              index + 1
            )}
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-body font-medium text-fg">
              {step.title}
              <span className="sr-only"> ({STATE_LABELS[step.state]})</span>
            </p>
            <p className="text-caption text-fg-muted">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
