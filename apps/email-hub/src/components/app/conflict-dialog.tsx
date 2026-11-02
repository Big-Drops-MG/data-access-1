"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"

type ConflictDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Load the latest server version. Form text stays until this runs. */
  onReload: () => void
  title?: string
  description?: string
  className?: string
}

/**
 * 409 conflict dialog (SD#12.4 / T-050).
 * Cancel keeps the user's in-form edits; Reload applies the newer server copy.
 */
export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
  title = "This was changed by someone else",
  description = "Your edits are still in the form. Reload to load the latest version, or keep editing.",
  className,
}: ConflictDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn(
          "max-w-[560px] gap-6 p-6 data-[size=default]:max-w-[560px] sm:max-w-[560px] data-[size=default]:sm:max-w-[560px]",
          className
        )}
        size="default"
        data-testid="conflict-dialog"
      >
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="text-h3 font-semibold text-fg">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-body text-fg-muted">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-border bg-surface-2 sm:justify-end">
          <AlertDialogCancel data-testid="conflict-dialog-keep-editing">
            Keep editing
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onReload()
              onOpenChange(false)
            }}
            data-testid="conflict-dialog-reload"
          >
            Reload
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
