-- marca x canal x dia, com todos os dias preenchidos (zero quando nao houve
-- nada). E a base do dashboard e da previsao: KPIs sempre saem das somas
-- desta tabela, nunca de media de taxas.
-- Campanha sem marca identificada entra como brand_id = 'sem_marca'.

CREATE OR REPLACE TABLE mart.agg_daily AS
WITH bounds AS (
  SELECT least((SELECT min(date) FROM mart.fct_ads_daily), (SELECT min(created_date) FROM mart.fct_leads)) AS first_day
),
spine AS (
  SELECT CAST(d AS DATE) AS date
  FROM bounds, generate_series(bounds.first_day, getvariable('as_of'), INTERVAL 1 DAY) AS t(d)
),
ads AS (
  SELECT date, coalesce(brand_id, 'sem_marca') AS brand_id, channel_id,
    sum(spend) AS spend, sum(impressions) AS impressions, sum(clicks) AS clicks
  FROM mart.fct_ads_daily GROUP BY ALL
),
web AS (
  SELECT date, brand_id, channel_id, sum(sessions) AS sessions
  FROM mart.fct_web_daily WHERE brand_id IS NOT NULL GROUP BY ALL
),
leads AS (
  SELECT created_date AS date, brand_id, channel_id,
    count(*) AS leads,
    count(*) FILTER (WHERE is_qualified) AS qualified,
    count(*) FILTER (WHERE is_paid AND campaign_key IS NOT NULL) AS paid_leads_with_campaign,
    count(*) FILTER (WHERE is_paid) AS paid_leads
  FROM mart.fct_leads WHERE NOT is_duplicate GROUP BY ALL
),
conv AS (
  SELECT converted_date AS date, brand_id, channel_id, count(*) AS conversions, sum(value) AS revenue
  FROM mart.fct_conversoes WHERE is_valid GROUP BY ALL
),
keys AS (
  SELECT brand_id, channel_id FROM ads
  UNION SELECT brand_id, channel_id FROM leads
  UNION SELECT brand_id, channel_id FROM conv
  UNION SELECT brand_id, channel_id FROM mart.fct_budget
)
SELECT
  s.date, k.brand_id, k.channel_id,
  coalesce(a.spend, 0) AS spend,
  coalesce(a.impressions, 0) AS impressions,
  coalesce(a.clicks, 0) AS clicks,
  coalesce(w.sessions, 0) AS sessions,
  coalesce(l.leads, 0) AS leads,
  coalesce(l.qualified, 0) AS qualified,
  coalesce(l.paid_leads, 0) AS paid_leads,
  coalesce(l.paid_leads_with_campaign, 0) AS paid_leads_with_campaign,
  coalesce(c.conversions, 0) AS conversions,
  coalesce(c.revenue, 0) AS revenue
FROM spine s
CROSS JOIN (SELECT DISTINCT * FROM keys) k
LEFT JOIN ads a ON a.date = s.date AND a.brand_id = k.brand_id AND a.channel_id = k.channel_id
LEFT JOIN web w ON w.date = s.date AND w.brand_id = k.brand_id AND w.channel_id = k.channel_id
LEFT JOIN leads l ON l.date = s.date AND l.brand_id = k.brand_id AND l.channel_id = k.channel_id
LEFT JOIN conv c ON c.date = s.date AND c.brand_id = k.brand_id AND c.channel_id = k.channel_id;

-- campanha x dia, para a pagina Canal e campanha (gasto + leads atribuidos)
CREATE OR REPLACE TABLE mart.agg_campaign_daily AS
WITH ads AS (
  SELECT date, campaign_key, sum(spend) AS spend, sum(impressions) AS impressions, sum(clicks) AS clicks
  FROM mart.fct_ads_daily GROUP BY ALL
),
leads AS (
  SELECT created_date AS date, campaign_key, count(*) AS leads, count(*) FILTER (WHERE is_qualified) AS qualified
  FROM mart.fct_leads WHERE NOT is_duplicate AND campaign_key IS NOT NULL GROUP BY ALL
),
conv AS (
  SELECT converted_date AS date, campaign_key, count(*) AS conversions, sum(value) AS revenue
  FROM mart.fct_conversoes WHERE is_valid AND campaign_key IS NOT NULL GROUP BY ALL
)
SELECT
  coalesce(a.date, l.date, c.date) AS date,
  coalesce(a.campaign_key, l.campaign_key, c.campaign_key) AS campaign_key,
  coalesce(a.spend, 0) AS spend, coalesce(a.impressions, 0) AS impressions, coalesce(a.clicks, 0) AS clicks,
  coalesce(l.leads, 0) AS leads, coalesce(l.qualified, 0) AS qualified,
  coalesce(c.conversions, 0) AS conversions, coalesce(c.revenue, 0) AS revenue
FROM ads a
FULL JOIN leads l ON l.date = a.date AND l.campaign_key = a.campaign_key
FULL JOIN conv c ON c.date = coalesce(a.date, l.date) AND c.campaign_key = coalesce(a.campaign_key, l.campaign_key);
