"use client"

import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

type FormFieldProps = {
  id: string
  label: string
  error?: string
  description?: string
  required?: boolean
  className?: string
  children: ReactNode
  /** Prefixed as `{testIdPrefix}-field-{name}` when set with `name`. */
  testIdPrefix?: string
  name?: string
}

/** Label + control + field error for form kit fields (SD#12.6). */
export function FormField({
  id,
  label,
  error,
  description,
  required,
  className,
  children,
  testIdPrefix,
  name,
}: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined
  const descriptionId = description ? `${id}-description` : undefined
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <div
      className={cn("space-y-1.5", className)}
      data-testid={
        testIdPrefix && name ? `${testIdPrefix}-field-${name}` : undefined
      }
    >
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
      </label>
      <div
        className="[&_input]:h-9 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border-strong [&_input]:bg-surface [&_input]:px-3 [&_input]:text-body [&_input]:text-fg [&_input]:outline-none [&_input]:focus-visible:shadow-[0_0_0_3px_var(--ring)] [&_input[aria-invalid=true]]:border-destructive"
        data-describedby={describedBy}
      >
        {children}
      </div>
      {description ? (
        <p id={descriptionId} className="text-caption text-fg-muted">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
