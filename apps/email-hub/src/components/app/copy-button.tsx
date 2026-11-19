"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

const outlineControl =
  "inline-flex h-auto items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-2 text-[13px] leading-none font-medium tracking-tight text-fg shadow-sm transition-[color,background-color,border-color,box-shadow] duration-150 outline-none hover:bg-surface-2 focus-visible:shadow-[0_0_0_3px_var(--ring)] disabled:pointer-events-none disabled:opacity-40"

const iconControl =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-fg-muted transition-[color,background-color,border-color] duration-150 outline-none hover:border-border hover:bg-surface-2 hover:text-fg focus-visible:shadow-[0_0_0_3px_var(--ring)]"

type CopyButtonProps = {
  value: string
  label: string
  testId?: string
  variant?: "icon" | "text"
  children?: React.ReactNode
  className?: string
}

export function CopyButton({
  value,
  label,
  testId,
  variant = "icon",
  children,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current)
      }
    },
    []
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      toast.error("Could not copy to clipboard")
      return
    }
    setCopied(true)
    if (timer.current != null) {
      window.clearTimeout(timer.current)
    }
    timer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  const Icon = copied ? Check : Copy

  if (variant === "text") {
    return (
      <button
        type="button"
        className={cn(outlineControl, className)}
        onClick={() => {
          void copy()
        }}
        data-testid={testId}
      >
        <Icon className="size-3.5" strokeWidth={2} aria-hidden />
        {copied ? "Copied" : children}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(iconControl, className)}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => {
        void copy()
      }}
      data-testid={testId}
    >
      <Icon className="size-3.5" strokeWidth={2} aria-hidden />
    </button>
  )
}
