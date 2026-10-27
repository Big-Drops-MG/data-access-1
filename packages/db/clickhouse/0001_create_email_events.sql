CREATE TABLE IF NOT EXISTS emailhub.email_events
(
    event_id            UUID,
    event_type          LowCardinality(String),
    event_time          DateTime64(3, 'UTC'),
    ingested_at         DateTime64(3, 'UTC') DEFAULT now64(3),
    message_id          UUID,
    ses_message_id      String,
    recipient_id        UUID,
    send_id             Nullable(UUID),
    offer_id            Nullable(UUID),
    email_type          LowCardinality(String),
    template_version_id UUID,
    sender_id           UUID,
    sending_domain      LowCardinality(String),
    recipient_domain    LowCardinality(String),
    provider            LowCardinality(String),
    bounce_type         LowCardinality(String),
    bounce_subtype      LowCardinality(String),
    smtp_status         LowCardinality(String),
    smtp_diagnostic     String CODEC(ZSTD(3)),
    delay_type          LowCardinality(String),
    complaint_type      LowCardinality(String),
    link_url            String CODEC(ZSTD(3)),
    user_agent          String CODEC(ZSTD(3)),
    client              LowCardinality(String),
    device_type         LowCardinality(String),
    os                  LowCardinality(String),
    country             LowCardinality(String),
    region              LowCardinality(String),
    is_machine          UInt8,
    machine_reason      LowCardinality(String),
    raw_payload         String CODEC(ZSTD(3)) TTL toDateTime(event_time) + INTERVAL 180 DAY
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (sending_domain, event_type, toDate(event_time, 'America/New_York'), message_id);

CREATE TABLE IF NOT EXISTS emailhub.recipient_activity
(
    event_id            UUID,
    event_type          LowCardinality(String),
    event_time          DateTime64(3, 'UTC'),
    ingested_at         DateTime64(3, 'UTC') DEFAULT now64(3),
    message_id          UUID,
    ses_message_id      String,
    recipient_id        UUID,
    send_id             Nullable(UUID),
    offer_id            Nullable(UUID),
    email_type          LowCardinality(String),
    template_version_id UUID,
    sender_id           UUID,
    sending_domain      LowCardinality(String),
    recipient_domain    LowCardinality(String),
    provider            LowCardinality(String),
    bounce_type         LowCardinality(String),
    bounce_subtype      LowCardinality(String),
    smtp_status         LowCardinality(String),
    smtp_diagnostic     String CODEC(ZSTD(3)),
    delay_type          LowCardinality(String),
    complaint_type      LowCardinality(String),
    link_url            String CODEC(ZSTD(3)),
    user_agent          String CODEC(ZSTD(3)),
    client              LowCardinality(String),
    device_type         LowCardinality(String),
    os                  LowCardinality(String),
    country             LowCardinality(String),
    region              LowCardinality(String),
    is_machine          UInt8,
    machine_reason      LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (recipient_id, event_time);

CREATE MATERIALIZED VIEW IF NOT EXISTS emailhub.recipient_activity_mv
TO emailhub.recipient_activity AS
SELECT * EXCEPT (raw_payload)
FROM emailhub.email_events;
