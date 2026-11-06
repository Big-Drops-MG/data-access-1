import {
  clickhouseQuery,
  type ClickHouseQueryParams,
} from "@workspace/db/clickhouse"
import { AppError } from "@workspace/shared"

import { buildReportQuery } from "./queries"
import { reportNameSchema, type ReportName, type ReportQuery } from "./schemas"

export type ReportResult = {
  name: ReportName
  from: string
  to: string
  include_machine: boolean
  data: Record<string, unknown>[]
}

export type ReportQueryRunner = (
  query: string,
  query_params?: ClickHouseQueryParams
) => Promise<Record<string, unknown>[]>

export function parseReportName(raw: string): ReportName {
  const parsed = reportNameSchema.safeParse(raw)
  if (!parsed.success) {
    throw AppError.notFound([{ path: "name", message: "Unknown report name" }])
  }
  return parsed.data
}

export async function getReport(
  name: ReportName,
  query: ReportQuery,
  runQuery: ReportQueryRunner = clickhouseQuery
): Promise<ReportResult> {
  const includeMachine = query.include_machine === true
  const plan = buildReportQuery({
    name,
    from: query.from,
    to: query.to,
    includeMachine,
  })
  const data = await runQuery(plan.query, plan.query_params)

  return {
    name,
    from: query.from,
    to: query.to,
    include_machine: includeMachine,
    data,
  }
}
