"use client"

import Link from "next/link"
import { Lock } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"

import {
  sendsOutlineControl,
  sendsPrimaryControl,
} from "@/features/sends/sends-ui"

type SendLockedDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Shown when a send can no longer be edited (non-draft or 409 lock). */
export function SendLockedDialog({
  open,
  onOpenChange,
}: SendLockedDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-[28rem] gap-0 overflow-hidden p-0 data-[size=default]:max-w-[28rem] sm:max-w-[28rem] data-[size=default]:sm:max-w-[28rem]"
        size="default"
        data-testid="send-locked-dialog"
      >
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="place-items-start gap-3 text-left">
            <div
              className="flex size-10 items-center justify-center rounded-full bg-warn/15 text-warn"
              aria-hidden
            >
              <Lock className="size-5" strokeWidth={2} />
            </div>
            <AlertDialogTitle className="text-lg leading-snug font-semibold tracking-tight text-fg">
              This send has already started
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-fg-muted">
              It can no longer be edited. Cancel it and create a new send
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <AlertDialogFooter
          className={cn(
            "m-0 rounded-none border-t border-border bg-surface-2 px-6 py-4 sm:justify-end",
            "group-data-[size=default]/alert-dialog-content:flex"
          )}
        >
          <AlertDialogCancel
            className={sendsOutlineControl("h-9 rounded-lg shadow-none")}
            size="lg"
          >
            Close
          </AlertDialogCancel>
          <Link
            href="/sends/new"
            className={sendsPrimaryControl("h-9 rounded-lg")}
            data-testid="send-locked-new"
            onClick={() => onOpenChange(false)}
          >
            New send
          </Link>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
