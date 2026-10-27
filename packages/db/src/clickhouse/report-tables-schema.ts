export const DAILY_SENDING_STATS_TABLE = "daily_sending_stats" as const
export const DAILY_SENDING_STATS_MV = "daily_sending_stats_mv" as const
export const ENGAGEMENT_DAILY_TABLE = "engagement_daily" as const
export const ENGAGEMENT_DAILY_MV = "engagement_daily_mv" as const
export const LINK_CLICKS_DAILY_TABLE = "link_clicks_daily" as const
export const LINK_CLICKS_DAILY_MV = "link_clicks_daily_mv" as const
export const ENVIRONMENT_DAILY_TABLE = "environment_daily" as const
export const ENVIRONMENT_DAILY_MV = "environment_daily_mv" as const

export const REPORT_TABLES = [
  DAILY_SENDING_STATS_TABLE,
  ENGAGEMENT_DAILY_TABLE,
  LINK_CLICKS_DAILY_TABLE,
  ENVIRONMENT_DAILY_TABLE,
] as const

export const REPORT_MATERIALIZED_VIEWS = [
  DAILY_SENDING_STATS_MV,
  ENGAGEMENT_DAILY_MV,
  LINK_CLICKS_DAILY_MV,
  ENVIRONMENT_DAILY_MV,
] as const

export const REPORT_DAY_EXPRESSION =
  "toDate(event_time, 'America/New_York')" as const
