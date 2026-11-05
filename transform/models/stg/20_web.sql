-- GA4: sessoes e eventos-chave por propriedade, dia e origem.

CREATE OR REPLACE TABLE stg.web_sessions AS
SELECT
  CAST(strptime(s.date, '%Y%m%d') AS DATE) AS date,
  s.property_id, p.brand_id,
  s.session_source AS source, s.session_medium AS medium, s.session_campaign_name AS campaign,
  coalesce(channel_from_utm(s.session_source, s.session_medium), 'organic') AS channel_id,
  CAST(s.sessions AS BIGINT) AS sessions,
  CAST(s.total_users AS BIGINT) AS users
FROM raw.ga4_sessions s
LEFT JOIN seed.ga4_properties p USING (property_id)
QUALIFY row_number() OVER (
  PARTITION BY s.property_id, s.date, s.session_source, s.session_medium, s.session_campaign_name
  ORDER BY s._ingested_at DESC) = 1;

CREATE OR REPLACE TABLE stg.web_events AS
SELECT
  CAST(strptime(e.date, '%Y%m%d') AS DATE) AS date,
  e.property_id, p.brand_id, e.event_name,
  e.session_source AS source, e.session_medium AS medium, e.session_campaign_name AS campaign,
  coalesce(channel_from_utm(e.session_source, e.session_medium), 'organic') AS channel_id,
  CAST(e.event_count AS BIGINT) AS event_count
FROM raw.ga4_events e
LEFT JOIN seed.ga4_properties p USING (property_id)
QUALIFY row_number() OVER (
  PARTITION BY e.property_id, e.date, e.event_name, e.session_source, e.session_medium, e.session_campaign_name
  ORDER BY e._ingested_at DESC) = 1;
