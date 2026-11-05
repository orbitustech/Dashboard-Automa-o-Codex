-- Dimensoes. A campanha e a ponte entre anuncio e lead: o nome no padrao
-- ORB | Marca | Objetivo | Canal (PMKT-307) diz a marca; fora do padrao a
-- campanha fica sem marca e aparece como alerta.

CREATE OR REPLACE TABLE mart.dim_brand AS
SELECT * FROM seed.brands;

CREATE OR REPLACE TABLE mart.dim_channel AS
SELECT channel_id, channel_name, is_paid = 1 AS is_paid FROM seed.channels;

CREATE OR REPLACE TABLE mart.dim_account AS
SELECT s.channel_id, a.account_id, a.account_name, a.owner, a.source_id
FROM seed.accounts a JOIN seed.sources s USING (source_id);

CREATE OR REPLACE TABLE mart.dim_campaign AS
WITH latest AS (
  SELECT channel_id, account_id, campaign_id,
    arg_max(campaign_name, date) AS campaign_name,
    min(date) AS first_date, max(date) AS last_date,
    sum(spend) AS lifetime_spend
  FROM stg.ads_daily
  GROUP BY ALL
), parsed AS (
  SELECT *,
    trim(split_part(campaign_name, '|', 1)) AS p_prefix,
    lower(trim(split_part(campaign_name, '|', 2))) AS p_brand,
    trim(split_part(campaign_name, '|', 3)) AS p_objective,
    lower(trim(split_part(campaign_name, '|', 4))) AS p_channel
  FROM latest
)
SELECT
  p.channel_id || ':' || p.campaign_id AS campaign_key,
  p.channel_id, p.account_id, p.campaign_id, p.campaign_name,
  t.brand_id,
  nullif(p.p_objective, '') AS objective,
  (p.p_prefix = 'ORB' AND t.brand_id IS NOT NULL AND c.channel_id = p.channel_id AND p.p_objective <> '') AS naming_ok,
  p.first_date, p.last_date, p.lifetime_spend,
  p.last_date >= getvariable('as_of') - INTERVAL 7 DAY AS is_active
FROM parsed p
LEFT JOIN seed.brand_tokens t ON t.token = p.p_brand
LEFT JOIN seed.channels c ON c.campaign_token = p.p_channel;
