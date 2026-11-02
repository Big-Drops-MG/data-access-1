"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

type CopyButtonProps = {
  value: string
  label: string
  testId?: string
  variant?: "icon" | "text"
  children?: React.ReactNode
}

export function CopyButton({
  value,
  label,
  testId,
  variant = "icon",
  children,
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void copy()
        }}
        data-testid={testId}
      >
        <Icon strokeWidth={1.75} aria-hidden />
        {copied ? "Copied" : children}
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => {
        void copy()
      }}
      data-testid={testId}
    >
      <Icon strokeWidth={1.75} aria-hidden />
    </Button>
  )
}
