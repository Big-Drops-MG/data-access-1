/** America/New_York — all product times are Eastern (SD#12.7). */
export const ET_TIME_ZONE = "America/New_York" as const

export type EtWallTime = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
}

export type EtResolveOk = {
  status: "ok"
  utc: Date
}

export type EtResolveNonexistent = {
  status: "nonexistent"
}

export type EtResolveAmbiguous = {
  status: "ambiguous"
  /** First occurrence (still on EDT, UTC−4). */
  earlier: Date
  /** Second occurrence (after fall-back, EST, UTC−5). */
  later: Date
}

export type EtResolveResult =
  EtResolveOk | EtResolveNonexistent | EtResolveAmbiguous

const etPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

const etDisplayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
})

const etAbbrevFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  timeZoneName: "short",
  hour: "numeric",
})

function readParts(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== "literal") {
      out[part.type] = part.value
    }
  }
  return out
}

/** Wall-clock parts of an instant in America/New_York. */
export function getEtWallTime(instant: Date): Required<EtWallTime> {
  const p = readParts(etPartsFormatter.formatToParts(instant))
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  }
}

function wallMatches(instant: Date, wall: EtWallTime): boolean {
  const actual = getEtWallTime(instant)
  const second = wall.second ?? 0
  return (
    actual.year === wall.year &&
    actual.month === wall.month &&
    actual.day === wall.day &&
    actual.hour === wall.hour &&
    actual.minute === wall.minute &&
    actual.second === second
  )
}

/**
 * Resolve an Eastern wall time to UTC.
 * Spring-forward gaps → nonexistent; fall-back overlaps → ambiguous (both UTC instants).
 */
export function resolveEtWallTime(wall: EtWallTime): EtResolveResult {
  const second = wall.second ?? 0
  const candidates: Date[] = []

  // Eastern observes either UTC−5 (EST) or UTC−4 (EDT).
  for (const offsetHours of [-5, -4] as const) {
    const utcMs = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour - offsetHours,
      wall.minute,
      second
    )
    const instant = new Date(utcMs)
    if (wallMatches(instant, { ...wall, second })) {
      candidates.push(instant)
    }
  }

  const unique = candidates.filter(
    (date, index, all) =>
      all.findIndex((other) => other.getTime() === date.getTime()) === index
  )

  if (unique.length === 0) {
    return { status: "nonexistent" }
  }

  if (unique.length === 1) {
    return { status: "ok", utc: unique[0]! }
  }

  unique.sort((a, b) => a.getTime() - b.getTime())
  return {
    status: "ambiguous",
    earlier: unique[0]!,
    later: unique[1]!,
  }
}

/** Format an instant as `MMM d, yyyy, h:mm a z` in America/New_York. */
export function formatEtDateTime(instant: Date | string | number): string {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return etDisplayFormatter.format(date)
}

/** Short zone label for an instant (EST or EDT). */
export function getEtAbbreviation(instant: Date): string {
  const parts = etAbbrevFormatter.formatToParts(instant)
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "ET"
}

/** Calendar date `YYYY-MM-DD` in America/New_York for an instant. */
export function formatEtDate(instant: Date | string | number): string {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  const wall = getEtWallTime(date)
  return `${String(wall.year).padStart(4, "0")}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`
}

/** `HH:mm` in America/New_York for an instant. */
export function formatEtTime(instant: Date | string | number): string {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  const wall = getEtWallTime(date)
  return `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`
}
