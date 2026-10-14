"use client"

import { isValidElement, useId, useState, type ReactElement } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"

type ConfirmDialogProps = {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** When set, confirm stays disabled until the input matches this phrase. */
  confirmPhrase?: string
  destructive?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onConfirm: () => void
  trigger?: ReactElement
  className?: string
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmPhrase,
  destructive = false,
  open,
  onOpenChange,
  onConfirm,
  trigger,
  className,
}: ConfirmDialogProps) {
  const inputId = useId()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [typedValue, setTypedValue] = useState("")
  const isControlled = open !== undefined
  const resolvedOpen = isControlled ? open : uncontrolledOpen
  const phraseRequired = Boolean(confirmPhrase)
  const phraseMatched = !phraseRequired || typedValue.trim() === confirmPhrase

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setTypedValue("")
    }
    if (!isControlled) {
      setUncontrolledOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
  }

  function handleConfirm() {
    if (!phraseMatched) {
      return
    }
    onConfirm()
    handleOpenChange(false)
  }

  return (
    <AlertDialog open={resolvedOpen} onOpenChange={handleOpenChange}>
      {trigger && isValidElement(trigger) ? (
        <AlertDialogTrigger render={trigger} />
      ) : null}
      <AlertDialogContent
        className={cn(
          "max-w-[560px] gap-6 p-6 data-[size=default]:max-w-[560px] sm:max-w-[560px] data-[size=default]:sm:max-w-[560px]",
          className
        )}
        size="default"
        data-testid="confirm-dialog"
      >
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="text-h3 font-semibold text-fg">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body text-fg-muted">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {confirmPhrase ? (
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="text-sm font-medium text-fg">
              Type{" "}
              <span className="font-mono text-caption">{confirmPhrase}</span> to
              confirm
            </label>
            <input
              id={inputId}
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
              className="h-9 w-full rounded-md border border-border-strong bg-surface px-3 text-body text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]"
              autoComplete="off"
              data-testid="confirm-dialog-phrase"
            />
          </div>
        ) : null}

        <AlertDialogFooter className="border-border bg-surface-2 sm:justify-end">
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={!phraseMatched}
            onClick={handleConfirm}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
