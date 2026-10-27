export const PROVIDER_METRICS_TABLE = "provider_metrics" as const

export const PROVIDER_METRICS_ORDER_BY =
  "(provider, target, metric, day)" as const

export const PROVIDER_METRICS_PROVIDERS = [
  "google_postmaster",
  "snds",
  "jmrp",
  "yahoo",
] as const

export type ProviderMetricsProvider =
  (typeof PROVIDER_METRICS_PROVIDERS)[number]

export const PROVIDER_METRICS_BY_PROVIDER = {
  google_postmaster: ["spam_rate", "domain_reputation", "ip_reputation"],
  snds: ["complaint_rate", "trap_hits", "filter_result"],
  jmrp: ["junk_reports"],
  yahoo: ["complaint_rate"],
} as const satisfies Record<ProviderMetricsProvider, readonly string[]>

export const DATA_CLOUD_DATABASE = "data_cloud" as const
export const DATA_CLOUD_RECIPIENT_TIER_TABLE = "recipient_tier" as const
export const DATA_CLOUD_TIER_DAILY_TABLE = "tier_daily" as const
export const DATA_CLOUD_RECIPIENT_TIER_VIEW = "v_recipient_tier" as const
export const DATA_CLOUD_TIER_DAILY_VIEW = "v_tier_daily" as const

export const DATA_CLOUD_VIEWS = [
  DATA_CLOUD_RECIPIENT_TIER_VIEW,
  DATA_CLOUD_TIER_DAILY_VIEW,
] as const

export const DATA_CLOUD_TIERS = ["standard", "premium"] as const

export type DataCloudTier = (typeof DATA_CLOUD_TIERS)[number]

export function providerMetricsQualifiedName(
  database: string = "emailhub"
): string {
  return `${database}.${PROVIDER_METRICS_TABLE}`
}

export function dataCloudViewQualifiedName(
  view: (typeof DATA_CLOUD_VIEWS)[number],
  database: string = DATA_CLOUD_DATABASE
): string {
  return `${database}.${view}`
}
