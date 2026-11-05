-- Midia paga das tres plataformas na mesma regua. O raw guarda cada
-- reprocessamento; aqui fica so a versao mais recente de cada chave.

CREATE OR REPLACE TABLE stg.meta_ads AS
SELECT
  CAST(date_start AS DATE) AS date,
  account_id, campaign_id, campaign_name, ad_id, ad_name,
  CAST(spend AS DOUBLE) AS spend,
  CAST(impressions AS BIGINT) AS impressions,
  CAST(clicks AS BIGINT) AS clicks,
  _ingested_at
FROM raw.meta_ads
QUALIFY row_number() OVER (PARTITION BY ad_id, date_start ORDER BY _ingested_at DESC) = 1;

CREATE OR REPLACE TABLE stg.google_ads AS
SELECT
  CAST(date AS DATE) AS date,
  customer_id AS account_id, campaign_id, campaign_name, campaign_status,
  CAST(cost_micros AS DOUBLE) / 1e6 AS spend,
  CAST(impressions AS BIGINT) AS impressions,
  CAST(clicks AS BIGINT) AS clicks,
  _ingested_at
FROM raw.google_ads
QUALIFY row_number() OVER (PARTITION BY customer_id, campaign_id, date ORDER BY _ingested_at DESC) = 1;

CREATE OR REPLACE TABLE stg.tiktok_ads AS
SELECT
  CAST(substr(stat_time_day, 1, 10) AS DATE) AS date,
  advertiser_id AS account_id, campaign_id, campaign_name,
  CAST(spend AS DOUBLE) AS spend,
  CAST(impressions AS BIGINT) AS impressions,
  CAST(clicks AS BIGINT) AS clicks,
  _ingested_at
FROM raw.tiktok_ads
QUALIFY row_number() OVER (PARTITION BY advertiser_id, campaign_id, stat_time_day ORDER BY _ingested_at DESC) = 1;

CREATE OR REPLACE TABLE stg.ads_daily AS
SELECT date, 'meta' AS channel_id, account_id, campaign_id, campaign_name, ad_id, spend, impressions, clicks FROM stg.meta_ads
UNION ALL
SELECT date, 'google_ads', account_id, campaign_id, campaign_name, NULL, spend, impressions, clicks FROM stg.google_ads
UNION ALL
SELECT date, 'tiktok', account_id, campaign_id, campaign_name, NULL, spend, impressions, clicks FROM stg.tiktok_ads;
