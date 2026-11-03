"use client"

import Link from "next/link"
import { TriangleAlert } from "lucide-react"

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

import type { SenderRouteConflict } from "@/features/senders/api"
import {
  sendersOutlineControl,
  sendersPrimaryControl,
} from "@/features/senders/senders-ui"

type SenderInUseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fromEmail: string
  routes: SenderRouteConflict[]
}

/** Shown when disabling a sender blocked by active email routes (409). */
export function SenderInUseDialog({
  open,
  onOpenChange,
  fromEmail,
  routes,
}: SenderInUseDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-[28rem] gap-0 overflow-hidden p-0 data-[size=default]:max-w-[28rem] sm:max-w-[28rem] data-[size=default]:sm:max-w-[28rem]"
        size="default"
        data-testid="sender-in-use-dialog"
      >
        <div className="space-y-5 px-6 pt-6 pb-5">
          <AlertDialogHeader className="place-items-start gap-3 text-left">
            <div
              className="flex size-10 items-center justify-center rounded-full bg-warn/15 text-warn"
              aria-hidden
            >
              <TriangleAlert className="size-5" strokeWidth={2} />
            </div>
            <AlertDialogTitle className="text-lg leading-snug font-semibold tracking-tight text-fg">
              This sender is still in use
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-fg-muted">
              <span className="font-mono text-[13px] text-fg">{fromEmail}</span>{" "}
              is used by an active route. Move the route to another sender
              first.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {routes.length > 0 ? (
            <ul
              className="divide-y divide-border overflow-hidden rounded-lg border border-border"
              data-testid="sender-in-use-routes"
            >
              {routes.map((route) => (
                <li
                  key={route.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] font-medium text-fg">
                    {route.emailType}
                  </code>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {route.name}
                  </span>
                  <Link
                    href={`/email-routes?id=${encodeURIComponent(route.id)}`}
                    className="shrink-0 text-sm font-medium text-fg underline-offset-2 hover:underline"
                    data-testid={`sender-in-use-open-${route.id}`}
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <AlertDialogFooter
          className={cn(
            "m-0 rounded-none border-t border-border bg-surface-2 px-6 py-4 sm:justify-end",
            "group-data-[size=default]/alert-dialog-content:flex"
          )}
        >
          <AlertDialogCancel
            className={sendersOutlineControl("h-9 rounded-lg shadow-none")}
            size="lg"
          >
            Close
          </AlertDialogCancel>
          <Link
            href="/email-routes"
            className={sendersPrimaryControl("h-9 rounded-lg")}
            data-testid="sender-in-use-go-routes"
            onClick={() => onOpenChange(false)}
          >
            Go to routes
          </Link>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
