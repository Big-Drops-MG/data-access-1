import { createClient, type ClickHouseClient } from "@clickhouse/client"

import {
  CLICKHOUSE_DATABASE,
  assertClickHouseUrl,
  resolveClickHouseUrl,
} from "./env.js"
import { assertClickHouseTableName } from "./identifiers.js"

export type ClickHouseQueryParams = NonNullable<
  Parameters<ClickHouseClient["query"]>[0]["query_params"]
>

export type ClickHouseInsertValues<T extends Record<string, unknown>> = T[]

let client: ClickHouseClient | undefined

export function getClickHouseClient(): ClickHouseClient {
  if (client) {
    return client
  }

  const url = resolveClickHouseUrl()
  client = createClient({
    url,
    database: CLICKHOUSE_DATABASE,
    clickhouse_settings: {
      date_time_input_format: "best_effort",
      date_time_output_format: "iso",
    },
  })

  return client
}

export async function closeClickHouseClient(): Promise<void> {
  if (!client) {
    return
  }

  const current = client
  client = undefined
  await current.close()
}

export async function clickhouseQuery<T extends Record<string, unknown>>(
  query: string,
  query_params: ClickHouseQueryParams = {}
): Promise<T[]> {
  const result = await getClickHouseClient().query({
    query,
    query_params,
    format: "JSONEachRow",
  })
  return result.json<T>()
}

export async function clickhouseCommand(
  query: string,
  query_params: ClickHouseQueryParams = {}
): Promise<void> {
  await getClickHouseClient().command({
    query,
    query_params,
  })
}

export async function clickhouseInsert<T extends Record<string, unknown>>(
  table: string,
  values: ClickHouseInsertValues<T>
): Promise<void> {
  if (values.length === 0) {
    return
  }

  const safeTable = assertClickHouseTableName(table)
  await getClickHouseClient().insert({
    table: safeTable,
    values,
    format: "JSONEachRow",
  })
}

/** Internal/test helper — not for app code. Prefer clickhouseQuery/Command/Insert. */
export function createClickHouseClientFromUrl(
  connectionString: string
): ClickHouseClient {
  assertClickHouseUrl(connectionString)
  return createClient({
    url: connectionString,
    database: CLICKHOUSE_DATABASE,
    clickhouse_settings: {
      date_time_input_format: "best_effort",
      date_time_output_format: "iso",
    },
  })
}
