import { z } from "zod"

import { getEtReportRange, parseEtDateString } from "@workspace/shared"

export const REPORT_NAMES = [
  "sending",
  "engagement",
  "link-clicks",
  "environment",
  "provider-metrics",
] as const

export type ReportName = (typeof REPORT_NAMES)[number]

export const reportNameSchema = z.enum(REPORT_NAMES)

export const MAX_REPORT_RANGE_DAYS = 92

const etDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
  .superRefine((value, ctx) => {
    try {
      parseEtDateString(value)
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid ET calendar date",
      })
    }
  })

export function inclusiveEtDayCount(from: string, to: string): number {
  const start = parseEtDateString(from)
  const end = parseEtDateString(to)
  const startUtc = Date.UTC(start.year, start.month - 1, start.day)
  const endUtc = Date.UTC(end.year, end.month - 1, end.day)
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1
}

export const reportQuerySchema = z
  .object({
    from: etDateSchema,
    to: etDateSchema,
    include_machine: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      getEtReportRange(value.from, value.to)
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "to must be on or after from",
      })
      return
    }

    const days = inclusiveEtDayCount(value.from, value.to)
    if (days > MAX_REPORT_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Date range must be at most ${MAX_REPORT_RANGE_DAYS} days`,
      })
    }
  })

export type ReportQuery = z.infer<typeof reportQuerySchema>
