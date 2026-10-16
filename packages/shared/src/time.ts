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

/** UTC instant → Eastern wall-clock parts. */
export function utcToEt(instant: Date | string | number): Required<EtWallTime> {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid UTC instant")
  }
  return getEtWallTime(date)
}

export type EtToUtcDisambiguation = "earlier" | "later"

/**
 * Eastern wall time → UTC.
 * Throws on nonexistent spring-forward times; for ambiguous fall-back times
 * uses `disambiguation` (`earlier` = still EDT, `later` = after fall-back EST).
 */
export function etToUtc(
  wall: EtWallTime,
  disambiguation: EtToUtcDisambiguation = "earlier"
): Date {
  const result = resolveEtWallTime(wall)
  if (result.status === "nonexistent") {
    throw new RangeError("Eastern wall time does not exist (spring forward)")
  }
  if (result.status === "ambiguous") {
    return result[disambiguation]
  }
  return result.utc
}

const ET_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseEtDateString(etDate: string): {
  year: number
  month: number
  day: number
} {
  const match = ET_DATE_RE.exec(etDate)
  if (!match) {
    throw new RangeError(`Invalid ET date (expected YYYY-MM-DD): ${etDate}`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // Reject impossible calendar dates (e.g. 2026-02-30).
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid ET calendar date: ${etDate}`)
  }
  return { year, month, day }
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + delta))
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  }
}

function etMidnightUtc(year: number, month: number, day: number): Date {
  // Local midnight is never in the spring-forward gap or fall-back overlap.
  const result = resolveEtWallTime({
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
  })
  if (result.status !== "ok") {
    throw new RangeError(
      `Could not resolve ET midnight for ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    )
  }
  return result.utc
}

export type EtDayRange = {
  /** Inclusive start of the ET calendar day (00:00:00.000 ET) as UTC. */
  start: Date
  /** Exclusive end — start of the next ET calendar day as UTC. */
  endExclusive: Date
}

/**
 * UTC half-open range `[start, endExclusive)` for one Eastern calendar day.
 * Length is 23h on spring-forward days and 25h on fall-back days (SD#16.3).
 */
export function getEtDayRange(etDate: string): EtDayRange {
  const { year, month, day } = parseEtDateString(etDate)
  const start = etMidnightUtc(year, month, day)
  const next = addCalendarDays(year, month, day, 1)
  const endExclusive = etMidnightUtc(next.year, next.month, next.day)
  return { start, endExclusive }
}

/**
 * UTC half-open range for an inclusive ET report window `from`…`to` (YYYY-MM-DD).
 * Events for the `to` day are included up to (but not including) the next midnight ET.
 */
export function getEtReportRange(from: string, to: string): EtDayRange {
  const startDay = parseEtDateString(from)
  const endDay = parseEtDateString(to)
  const start = etMidnightUtc(startDay.year, startDay.month, startDay.day)
  const dayAfterTo = addCalendarDays(endDay.year, endDay.month, endDay.day, 1)
  const endExclusive = etMidnightUtc(
    dayAfterTo.year,
    dayAfterTo.month,
    dayAfterTo.day
  )
  if (endExclusive.getTime() <= start.getTime()) {
    throw new RangeError(`ET report range is empty or reversed: ${from}…${to}`)
  }
  return { start, endExclusive }
}
