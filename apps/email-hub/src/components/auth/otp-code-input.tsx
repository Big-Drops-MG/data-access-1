"use client"

import {
  useEffect,
  useId,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react"

import { cn } from "@workspace/ui/lib/utils"

type OtpCodeInputProps = {
  value: string
  onChange: (value: string) => void
  length?: number
  disabled?: boolean
  autoFocus?: boolean
  "aria-label"?: string
  className?: string
}

function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, "")
}

/** Six-box TOTP input split as 3 + 3 (matches auth mockups). */
export function OtpCodeInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  "aria-label": ariaLabel = "6-digit verification code",
  className,
}: OtpCodeInputProps) {
  const id = useId()
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])
  const digits = onlyDigits(value)
    .slice(0, length)
    .padEnd(length, " ")
    .split("")

  useEffect(() => {
    if (autoFocus) {
      inputsRef.current[0]?.focus()
    }
  }, [autoFocus])

  function setDigit(index: number, digit: string) {
    const next = onlyDigits(value).slice(0, length).split("")
    while (next.length < length) {
      next.push("")
    }
    next[index] = digit
    onChange(next.join("").slice(0, length))
  }

  function handleChange(index: number, raw: string) {
    const cleaned = onlyDigits(raw)
    if (!cleaned) {
      setDigit(index, "")
      return
    }
    if (cleaned.length > 1) {
      const merged = onlyDigits(
        value.slice(0, index) + cleaned + value.slice(index + 1)
      ).slice(0, length)
      onChange(merged)
      const focusAt = Math.min(index + cleaned.length, length - 1)
      inputsRef.current[focusAt]?.focus()
      return
    }
    setDigit(index, cleaned)
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      event.preventDefault()
      setDigit(index - 1, "")
      inputsRef.current[index - 1]?.focus()
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault()
      inputsRef.current[index - 1]?.focus()
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault()
      inputsRef.current[index + 1]?.focus()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const pasted = onlyDigits(event.clipboardData.getData("text")).slice(
      0,
      length
    )
    if (!pasted) {
      return
    }
    onChange(pasted)
    inputsRef.current[Math.min(pasted.length, length) - 1]?.focus()
  }

  const mid = Math.floor(length / 2)

  return (
    <div
      className={cn("flex items-center justify-center gap-2.5", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {digits.map((digit, index) => (
        <span key={`${id}-${index}`} className="contents">
          {index === mid ? (
            <span
              className="px-1.5 text-xl font-semibold text-fg-subtle"
              aria-hidden
            >
              -
            </span>
          ) : null}
          <input
            ref={(node) => {
              inputsRef.current[index] = node
            }}
            id={`${id}-${index}`}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={digit.trim()}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            className={cn(
              "size-14 rounded-xl border border-border-strong bg-surface text-center text-2xl font-bold tracking-wide text-fg shadow-none outline-none",
              "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
            aria-label={`Digit ${index + 1}`}
            data-testid={`otp-digit-${index}`}
          />
        </span>
      ))}
    </div>
  )
}
