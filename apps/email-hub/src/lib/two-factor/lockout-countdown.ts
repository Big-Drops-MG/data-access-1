/** Remaining ms until lockedUntil; 0 when expired or invalid. */
export function remainingLockMs(
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): number {
  if (!lockedUntil) {
    return 0
  }
  const end = Date.parse(lockedUntil)
  if (Number.isNaN(end)) {
    return 0
  }
  return Math.max(0, end - now.getTime())
}

/** Format remaining lock time as M:SS for the verify button. */
export function formatLockCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}
