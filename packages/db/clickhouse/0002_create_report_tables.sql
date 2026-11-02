CREATE TABLE IF NOT EXISTS emailhub.daily_sending_stats
(
    day Date,
    sending_domain LowCardinality(String),
    provider LowCardinality(String),
    email_type LowCardinality(String),
    sent UInt64,
    delivered UInt64,
    bounce_hard UInt64,
    bounce_soft UInt64,
    delivery_delay UInt64,
    complaint UInt64,
    reject UInt64
)
ENGINE = SummingMergeTree
ORDER BY (day, sending_domain, provider, email_type);

CREATE MATERIALIZED VIEW IF NOT EXISTS emailhub.daily_sending_stats_mv
TO emailhub.daily_sending_stats AS
SELECT
    toDate(event_time, 'America/New_York') AS day,
    sending_domain,
    provider,
    email_type,
    countIf(event_type = 'sent') AS sent,
    countIf(event_type = 'delivered') AS delivered,
    countIf(event_type = 'bounce_hard') AS bounce_hard,
    countIf(event_type = 'bounce_soft') AS bounce_soft,
    countIf(event_type = 'delivery_delay') AS delivery_delay,
    countIf(event_type = 'complaint') AS complaint,
    countIf(event_type = 'reject') AS reject
FROM emailhub.email_events
GROUP BY day, sending_domain, provider, email_type;

CREATE TABLE IF NOT EXISTS emailhub.engagement_daily
(
    day Date,
    sending_domain LowCardinality(String),
    provider LowCardinality(String),
    email_type LowCardinality(String),
    is_machine UInt8,
    opens SimpleAggregateFunction(sum, UInt64),
    unique_opens AggregateFunction(uniq, UUID),
    clicks SimpleAggregateFunction(sum, UInt64),
    unique_clicks AggregateFunction(uniq, UUID),
    unsubscribes SimpleAggregateFunction(sum, UInt64)
)
ENGINE = AggregatingMergeTree
ORDER BY (day, sending_domain, provider, email_type, is_machine);

CREATE MATERIALIZED VIEW IF NOT EXISTS emailhub.engagement_daily_mv
TO emailhub.engagement_daily AS
SELECT
    toDate(event_time, 'America/New_York') AS day,
    sending_domain,
    provider,
    email_type,
    is_machine,
    countIf(event_type = 'open') AS opens,
    uniqStateIf(message_id, event_type = 'open') AS unique_opens,
    countIf(event_type = 'click') AS clicks,
    uniqStateIf(message_id, event_type = 'click') AS unique_clicks,
    countIf(event_type = 'unsubscribe') AS unsubscribes
FROM emailhub.email_events
GROUP BY day, sending_domain, provider, email_type, is_machine;

CREATE TABLE IF NOT EXISTS emailhub.link_clicks_daily
(
    day Date,
    template_version_id UUID,
    link_url String,
    is_machine UInt8,
    clicks UInt64
)
ENGINE = SummingMergeTree
ORDER BY (day, template_version_id, link_url, is_machine);

CREATE MATERIALIZED VIEW IF NOT EXISTS emailhub.link_clicks_daily_mv
TO emailhub.link_clicks_daily AS
SELECT
    toDate(event_time, 'America/New_York') AS day,
    template_version_id,
    link_url,
    is_machine,
    count() AS clicks
FROM emailhub.email_events
WHERE event_type = 'click'
GROUP BY day, template_version_id, link_url, is_machine;

CREATE TABLE IF NOT EXISTS emailhub.environment_daily
(
    day Date,
    client LowCardinality(String),
    device_type LowCardinality(String),
    os LowCardinality(String),
    country LowCardinality(String),
    region LowCardinality(String),
    is_machine UInt8,
    opens UInt64,
    clicks UInt64,
    unsubscribes UInt64
)
ENGINE = SummingMergeTree
ORDER BY (day, client, device_type, os, country, region, is_machine);

CREATE MATERIALIZED VIEW IF NOT EXISTS emailhub.environment_daily_mv
TO emailhub.environment_daily AS
SELECT
    toDate(event_time, 'America/New_York') AS day,
    client,
    device_type,
    os,
    country,
    region,
    is_machine,
    countIf(event_type = 'open') AS opens,
    countIf(event_type = 'click') AS clicks,
    countIf(event_type = 'unsubscribe') AS unsubscribes
FROM emailhub.email_events
WHERE event_type IN ('open', 'click', 'unsubscribe')
GROUP BY day, client, device_type, os, country, region, is_machine;
