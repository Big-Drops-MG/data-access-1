"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  domainsIconControl,
  domainsOutlineControl,
} from "@/features/domains/domains-ui"
import { cn } from "@workspace/ui/lib/utils"

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
        className={cn(domainsOutlineControl(), className)}
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
      className={cn(domainsIconControl(), className)}
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
