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
          "max-w-[28rem] gap-0 overflow-hidden p-0 data-[size=default]:max-w-[28rem] sm:max-w-[28rem] data-[size=default]:sm:max-w-[28rem]",
          className
        )}
        size="default"
        data-testid="confirm-dialog"
      >
        <div className="space-y-5 px-6 pt-6 pb-5">
          <AlertDialogHeader className="place-items-start gap-2 text-left">
            <AlertDialogTitle className="text-lg leading-snug font-semibold tracking-tight text-fg">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-fg-muted">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmPhrase ? (
            <div className="space-y-2.5">
              <label
                htmlFor={inputId}
                className="block text-sm leading-5 text-fg"
              >
                Type{" "}
                <span className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] font-medium text-fg">
                  {confirmPhrase}
                </span>{" "}
                to confirm
              </label>
              <input
                id={inputId}
                value={typedValue}
                onChange={(event) => setTypedValue(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg transition-[border-color,box-shadow] outline-none placeholder:text-fg-muted focus-visible:border-border-strong focus-visible:shadow-[0_0_0_3px_var(--ring)]"
                autoComplete="off"
                spellCheck={false}
                data-testid="confirm-dialog-phrase"
              />
            </div>
          ) : null}
        </div>

        <AlertDialogFooter
          className={cn(
            "m-0 rounded-none border-t border-border bg-surface-2 px-6 py-4 sm:justify-end",
            "group-data-[size=default]/alert-dialog-content:flex"
          )}
        >
          <AlertDialogCancel
            className="h-9 rounded-lg border-border bg-surface px-3.5 text-sm font-medium text-fg hover:bg-surface"
            size="lg"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            size="lg"
            disabled={!phraseMatched}
            onClick={handleConfirm}
            data-testid="confirm-dialog-confirm"
            className={cn(
              "h-9 rounded-lg px-3.5 text-sm font-medium",
              destructive &&
                "border-transparent bg-err text-surface hover:bg-err/90 disabled:bg-err/40 disabled:text-surface disabled:opacity-100"
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
