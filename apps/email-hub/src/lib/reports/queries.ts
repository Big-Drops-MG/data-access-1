import type { ClickHouseQueryParams } from "@workspace/db/clickhouse"

import type { ReportName } from "./schemas"

export const LINK_CLICKS_TOP_LIMIT = 100

const DAILY_SENDING_STATS_TABLE = "daily_sending_stats"
const ENGAGEMENT_DAILY_TABLE = "engagement_daily"
const LINK_CLICKS_DAILY_TABLE = "link_clicks_daily"
const ENVIRONMENT_DAILY_TABLE = "environment_daily"
const PROVIDER_METRICS_TABLE = "provider_metrics"
const EMAIL_EVENTS_TABLE = "email_events"

export type ReportQueryPlan = {
  query: string
  query_params: ClickHouseQueryParams
}

export function buildReportQuery(input: {
  name: ReportName
  from: string
  to: string
  includeMachine: boolean
  domain?: string
}): ReportQueryPlan {
  const rangeParams: ClickHouseQueryParams = {
    from: input.from,
    to: input.to,
  }

  switch (input.name) {
    case "sending":
      return {
        query: `
SELECT
  day,
  sending_domain,
  provider,
  email_type,
  sum(sent) AS sent,
  sum(delivered) AS delivered,
  sum(bounce_hard) AS bounce_hard,
  sum(bounce_soft) AS bounce_soft,
  sum(delivery_delay) AS delivery_delay,
  sum(complaint) AS complaint,
  sum(reject) AS reject
FROM ${DAILY_SENDING_STATS_TABLE}
WHERE day BETWEEN {from:Date} AND {to:Date}
GROUP BY day, sending_domain, provider, email_type
ORDER BY day, sending_domain, provider, email_type
`.trim(),
        query_params: rangeParams,
      }

    case "engagement": {
      const machineFilter = input.includeMachine
        ? ""
        : " AND is_machine = {is_machine:UInt8}"
      return {
        query: `
SELECT
  day,
  sending_domain,
  provider,
  email_type,
  sum(opens) AS opens,
  uniqMerge(unique_opens) AS unique_opens,
  sum(clicks) AS clicks,
  uniqMerge(unique_clicks) AS unique_clicks,
  sum(unsubscribes) AS unsubscribes
FROM ${ENGAGEMENT_DAILY_TABLE}
WHERE day BETWEEN {from:Date} AND {to:Date}${machineFilter}
GROUP BY day, sending_domain, provider, email_type
ORDER BY day, sending_domain, provider, email_type
`.trim(),
        query_params: input.includeMachine
          ? rangeParams
          : { ...rangeParams, is_machine: 0 },
      }
    }

    case "link-clicks": {
      const machineFilter = input.includeMachine
        ? ""
        : " AND is_machine = {is_machine:UInt8}"
      return {
        query: `
SELECT
  link_url,
  template_version_id,
  sum(clicks) AS clicks
FROM ${LINK_CLICKS_DAILY_TABLE}
WHERE day BETWEEN {from:Date} AND {to:Date}${machineFilter}
GROUP BY link_url, template_version_id
ORDER BY clicks DESC
LIMIT {limit:UInt32}
`.trim(),
        query_params: {
          ...rangeParams,
          limit: LINK_CLICKS_TOP_LIMIT,
          ...(input.includeMachine ? {} : { is_machine: 0 }),
        },
      }
    }

    case "environment": {
      const machineFilter = input.includeMachine
        ? ""
        : " AND is_machine = {is_machine:UInt8}"
      return {
        query: `
SELECT
  day,
  client,
  device_type,
  os,
  country,
  region,
  sum(opens) AS opens,
  sum(clicks) AS clicks,
  sum(unsubscribes) AS unsubscribes
FROM ${ENVIRONMENT_DAILY_TABLE}
WHERE day BETWEEN {from:Date} AND {to:Date}${machineFilter}
GROUP BY day, client, device_type, os, country, region
ORDER BY day, client, device_type, os, country, region
`.trim(),
        query_params: input.includeMachine
          ? rangeParams
          : { ...rangeParams, is_machine: 0 },
      }
    }

    case "open-frequency": {
      const machineFilter = input.includeMachine
        ? ""
        : " AND is_machine = {is_machine:UInt8}"
      const domain = input.domain?.trim() ?? ""
      return {
        query: `
SELECT
  multiIf(
    opens = 1, '1',
    opens = 2, '2',
    opens = 3, '3',
    opens = 4, '4',
    opens = 5, '5',
    '8+'
  ) AS bucket,
  count() AS recipients
FROM (
  SELECT
    recipient_id,
    count() AS opens
  FROM ${EMAIL_EVENTS_TABLE}
  WHERE event_type = 'open'
    AND toDate(event_time, 'America/New_York') BETWEEN {from:Date} AND {to:Date}
    AND ({domain:String} = '' OR sending_domain = {domain:String})${machineFilter}
  GROUP BY recipient_id
)
GROUP BY bucket
ORDER BY multiIf(bucket = '1', 1, bucket = '2', 2, bucket = '3', 3, bucket = '4', 4, bucket = '5', 5, 6)
`.trim(),
        query_params: {
          ...rangeParams,
          domain,
          ...(input.includeMachine ? {} : { is_machine: 0 }),
        },
      }
    }

    case "provider-metrics":
      return {
        query: `
SELECT
  provider,
  target,
  metric,
  day,
  value
FROM ${PROVIDER_METRICS_TABLE} FINAL
WHERE day BETWEEN {from:Date} AND {to:Date}
ORDER BY day, provider, target, metric
`.trim(),
        query_params: rangeParams,
      }
  }
}
