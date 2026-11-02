CREATE TABLE IF NOT EXISTS emailhub.provider_metrics
(
    day              Date,
    provider         LowCardinality(String),
    target           String,
    metric           LowCardinality(String),
    value            Float64,
    source_report_id UUID,
    version          UInt64
)
ENGINE = ReplacingMergeTree(version)
PARTITION BY toYYYYMM(day)
ORDER BY (provider, target, metric, day);

CREATE DATABASE IF NOT EXISTS data_cloud;

CREATE TABLE IF NOT EXISTS data_cloud.recipient_tier
(
    external_user_id String,
    tier             LowCardinality(String),
    tier_updated_at  DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree(tier_updated_at)
ORDER BY external_user_id;

CREATE TABLE IF NOT EXISTS data_cloud.tier_daily
(
    day   Date,
    tier  LowCardinality(String),
    users UInt64
)
ENGINE = SummingMergeTree
ORDER BY (day, tier);

CREATE VIEW IF NOT EXISTS data_cloud.v_recipient_tier AS
SELECT
    external_user_id,
    tier,
    tier_updated_at
FROM data_cloud.recipient_tier;

CREATE VIEW IF NOT EXISTS data_cloud.v_tier_daily AS
SELECT
    day,
    tier,
    users
FROM data_cloud.tier_daily;
