-- Fatos. Grao de cada tabela no comentario; todas cruzam por
-- marca x canal x campanha x dia.

-- dia x anuncio (Meta) ou dia x campanha (Google, TikTok)
CREATE OR REPLACE TABLE mart.fct_ads_daily AS
SELECT
  a.date, a.channel_id, a.account_id, a.campaign_id, a.ad_id,
  a.channel_id || ':' || a.campaign_id AS campaign_key,
  c.brand_id, c.objective,
  a.spend, a.impressions, a.clicks
FROM stg.ads_daily a
LEFT JOIN mart.dim_campaign c ON c.campaign_key = a.channel_id || ':' || a.campaign_id;

-- dia x site x origem (UTM)
CREATE OR REPLACE TABLE mart.fct_web_daily AS
SELECT
  s.date, s.brand_id, s.property_id, s.channel_id, s.source, s.medium, s.campaign,
  m.campaign_key, s.sessions, s.users
FROM stg.web_sessions s
LEFT JOIN (
  SELECT channel_id, lower(campaign_name) AS name_key, arg_max(campaign_key, lifetime_spend) AS campaign_key
  FROM mart.dim_campaign GROUP BY ALL
) m ON m.channel_id = s.channel_id AND m.name_key = lower(s.campaign);

-- dia x site x evento x origem
CREATE OR REPLACE TABLE mart.fct_web_events AS
SELECT date, brand_id, property_id, event_name, channel_id, campaign, event_count
FROM stg.web_events;

-- Busca de campanha por UTM: nome exato (sem caixa) ou o proprio id.
CREATE OR REPLACE TEMP TABLE campaign_lookup AS
SELECT channel_id, k, arg_max(campaign_key, lifetime_spend) AS campaign_key
FROM (
  SELECT channel_id, lower(campaign_name) AS k, campaign_key, lifetime_spend FROM mart.dim_campaign
  UNION ALL
  SELECT channel_id, campaign_id, campaign_key, lifetime_spend FROM mart.dim_campaign
)
GROUP BY ALL;

-- um registro por lead. Atribuicao inicial: ultimo clique.
-- is_duplicate = mesmo contato na mesma marca ha menos de 30 dias; KPIs contam so os nao duplicados.
CREATE OR REPLACE TABLE mart.fct_leads AS
WITH attributed AS (
  SELECT l.*,
    attributed_channel(gclid, fbclid, ttclid, utm_source, utm_medium) AS channel_id,
    attribution_method(gclid, fbclid, ttclid, utm_campaign) AS attribution_method
  FROM stg.leads l
)
SELECT
  a.brand_id, a.lead_id, a.source_id, a.contact_hash,
  a.created_at, CAST(a.created_at AS DATE) AS created_date,
  a.is_qualified,
  q.reached_at AS qualified_at,
  a.current_stage,
  a.channel_id,
  ch.is_paid = 1 AS is_paid,
  a.attribution_method,
  a.utm_source, a.utm_medium, a.utm_campaign, a.utm_content,
  cl.campaign_key,
  coalesce(a.created_at - lag(a.created_at) OVER (PARTITION BY a.brand_id, a.contact_hash ORDER BY a.created_at) <= INTERVAL 30 DAY, false) AS is_duplicate
FROM attributed a
LEFT JOIN seed.channels ch ON ch.channel_id = a.channel_id
LEFT JOIN campaign_lookup cl ON cl.channel_id = a.channel_id AND cl.k = lower(a.utm_campaign)
LEFT JOIN (
  SELECT brand_id, lead_id, min(reached_at) AS reached_at FROM stg.lead_stages WHERE stage = 'qualificado' GROUP BY ALL
) q ON q.brand_id = a.brand_id AND q.lead_id = a.lead_id;

-- uma linha por lead x etapa alcancada
CREATE OR REPLACE TABLE mart.fct_lead_stages AS
SELECT s.brand_id, s.lead_id, s.stage, s.reached_at, CAST(s.reached_at AS DATE) AS reached_date
FROM stg.lead_stages s;

-- uma venda, apolice, pedido ou cadastro ativo. Herda a origem do lead;
-- sem lead (pedido direto na loja), usa a propria UTM.
CREATE OR REPLACE TABLE mart.fct_conversoes AS
SELECT
  c.brand_id, c.conversao_id, c.lead_id, c.source_id, c.tipo, c.status,
  c.status = 'aprovada' AS is_valid,
  c.converted_at, CAST(c.converted_at AS DATE) AS converted_date,
  c.value,
  coalesce(l.channel_id, attributed_channel(c.gclid, c.fbclid, c.ttclid, c.utm_source, c.utm_medium)) AS channel_id,
  coalesce(l.campaign_key, cl.campaign_key) AS campaign_key,
  l.created_date AS lead_date
FROM stg.conversoes c
LEFT JOIN mart.fct_leads l ON l.brand_id = c.brand_id AND l.lead_id = c.lead_id
LEFT JOIN campaign_lookup cl
  ON cl.channel_id = attributed_channel(c.gclid, c.fbclid, c.ttclid, c.utm_source, c.utm_medium)
 AND cl.k = lower(c.utm_campaign)
 AND l.lead_id IS NULL;

-- marca x canal x mes
CREATE OR REPLACE TABLE mart.fct_budget AS
SELECT month, brand_id, channel_id, sum(budget) AS budget, sum(goal_leads) AS goal_leads, sum(goal_sales) AS goal_sales
FROM stg.budget
GROUP BY ALL;
